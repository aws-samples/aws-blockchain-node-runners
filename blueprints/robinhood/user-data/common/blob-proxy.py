#!/usr/bin/env python3
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Beacon Blob Proxy — Robinhood Chain TESTNET only.
#
# Robinhood Chain testnet settles to Ethereum Sepolia. Nitro must fetch blob
# data (EIP-4844 / PeerDAS) from an L1 beacon endpoint. Nitro calls its own
# simplified endpoint:
#
#     GET /eth/v1/beacon/blobs/{slot}?versioned_hashes=0x..&versioned_hashes=..
#
# and — critically — deserializes the response into Go type
# `fullResult[[]hexutil.Bytes]`, i.e. a FLAT ARRAY OF BLOB HEX STRINGS:
#
#     {"data": ["0x<48KiB blob hex>", "0x<48KiB blob hex>", ...]}
#
# NOT an array of sidecar objects. Nitro also requires:
#   * exactly one blob per requested versioned_hash
#     ("expected N blobs for slot but got M" otherwise), and
#   * the blobs returned IN THE SAME ORDER as the requested versioned_hashes
#     (Nitro verifies blob[i] against versionedHashes[i]).
# (Source: OffchainLabs/nitro util/headerreader/blob_client.go, getBlobs →
#  beaconRequest[[]hexutil.Bytes].)
#
# Beacons that predate the Fulu getBlobs endpoint expose only
# /eth/v1/beacon/blob_sidecars/{slot}, which returns OBJECTS
# ({index, blob, kzg_commitment, kzg_proof, ...}). This proxy serves Nitro's
# format from whichever source has the blob, translating sidecar objects into
# the flat, versioned-hash-ordered string array Nitro wants.
#
# Source selection:
#   0. STANDARD getBlobs — /eth/v1/beacon/blobs/{slot}?versioned_hashes=..
#      on the real beacon, one hash per request. Required since Sepolia's
#      Glamsterdam (Gloas) fork at slot 11,296,768: Gloas moved blob
#      commitments out of the beacon block body, so blob_sidecars/{slot}
#      returns 400 "pre-Deneb, no blobs" for every Gloas slot.
#   1. BEACON SIDECARS — the real beacon's blob_sidecars endpoint has every blob
#      still inside its rolling retention window (~18 days). We fetch the
#      sidecars, index them by versioned_hash (derived from each sidecar's
#      kzg_commitment), and emit the requested blobs in order.
#   2. BLOCKSCOUT FALLBACK — only for blobs the beacon has already pruned.
#      Blockscout keeps blob metadata indefinitely but does NOT always store
#      the bytes: entries can come back with blob_data=null. Such an entry is
#      a MISS, not a hit, and must never be served (a null would fail Nitro's
#      hex-string unmarshal, and a wrong/empty blob fails KZG verification).
#
# Mainnet does NOT need this (Ethereum-mainnet beacon providers serve the
# required blobs directly), so node.sh only starts it on testnet.
#
# The real beacon URL is read from the ROBINHOOD_L1_BEACON_URL environment
# variable (exported from /etc/cdk_environment by the systemd unit).

from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from urllib.request import urlopen, Request
import hashlib
import json
import os
import re
import sys

BLOCKSCOUT = "https://eth-sepolia.blockscout.com/api/v2/blobs"
REAL_BEACON = os.environ.get("ROBINHOOD_L1_BEACON_URL", "").rstrip("/")

# Optional secondary free Sepolia beacon(s), tried in order when the primary
# errors or (transiently) 403s. Overridable via ROBINHOOD_L1_BEACON_URL_SECONDARY
# (comma-separated). Default: ChainSafe's public Lodestar Sepolia node, which
# serves blob_sidecars with the same schema and no key.
_SECONDARY = os.environ.get(
    "ROBINHOOD_L1_BEACON_URL_SECONDARY",
    "https://lodestar-sepolia.chainsafe.io",
)
SECONDARY_BEACONS = [u.strip().rstrip("/") for u in _SECONDARY.split(",") if u.strip()]


def _http_url(u):
    """Keep only http(s) URLs, so a mistyped env value can't make urlopen read
    a local file (file://) or another scheme."""
    return u if re.match(r'^https?://', u or '') else ""


REAL_BEACON = _http_url(REAL_BEACON)
SECONDARY_BEACONS = [u for u in map(_http_url, SECONDARY_BEACONS) if u]
VERSIONED_HASH = re.compile(r'^0x01[0-9a-f]{62}$')

# Some free beacons 403 a default urllib User-Agent; present a browser-like one.
_UA = "Mozilla/5.0 (compatible; robinhood-blob-proxy/1.0)"

# EIP-4844 versioned hash: 0x01 || sha256(kzg_commitment)[1:]
VERSIONED_HASH_VERSION_KZG = 0x01


def _norm_hex(h):
    """Lowercase, 0x-prefixed hex string."""
    if h is None:
        return None
    h = h.lower()
    return h if h.startswith("0x") else "0x" + h


def kzg_commitment_to_versioned_hash(commitment_hex):
    """Derive the EIP-4844 versioned hash from a KZG commitment.

    versioned_hash = 0x01 || sha256(commitment)[1:]
    """
    c = commitment_hex.lower()
    if c.startswith("0x"):
        c = c[2:]
    digest = hashlib.sha256(bytes.fromhex(c)).digest()
    return "0x" + format(VERSIONED_HASH_VERSION_KZG, "02x") + digest[1:].hex()


class BlobProxyHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[blob-proxy] {fmt % args}", file=sys.stderr, flush=True)

    def _send_json(self, body):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def proxy_to_real_beacon(self, path):
        if not REAL_BEACON:
            self.send_error(502, "ROBINHOOD_L1_BEACON_URL not configured")
            return
        url = REAL_BEACON + path
        try:
            req = Request(url, headers={"User-Agent": "blob-proxy/1.0"})
            with urlopen(req, timeout=15) as r:
                body = r.read()
            self._send_json(body)
        except Exception as e:
            self.send_error(502, str(e))

    def _beacon_blobs_direct(self, slot, versioned_hashes):
        """Fetch blobs via the standard beacon getBlobs endpoint (Fulu+).

        GET /eth/v1/beacon/blobs/{slot}?versioned_hashes=<vh> returns
        {"data": ["0x<blob>"]}. This is the only path that works for Gloas
        (Glamsterdam) blocks: from Gloas on, blob commitments moved out of the
        beacon block body into the execution payload envelope, so
        blob_sidecars/{slot} answers 400 "pre-Deneb, no blobs" even though
        the blobs exist. One versioned hash per request, so each answer maps
        to exactly one requested hash and request order is preserved.

        Returns a {versioned_hash: blob_hex} map, or None if no beacon could
        serve every requested hash."""
        if not versioned_hashes:
            return None
        beacons = ([REAL_BEACON] if REAL_BEACON else []) + SECONDARY_BEACONS
        for base in beacons:
            by_vh = {}
            for vh in versioned_hashes:
                url = f"{base}/eth/v1/beacon/blobs/{slot}?versioned_hashes={vh}"
                try:
                    req = Request(url, headers={"User-Agent": _UA, "Accept": "application/json"})
                    with urlopen(req, timeout=20) as r:
                        data = json.loads(r.read()).get("data") or []
                except Exception as e:
                    print(f"[blob-proxy] getBlobs miss slot={slot} via {base}: {e}",
                          file=sys.stderr, flush=True)
                    break
                if len(data) != 1 or not isinstance(data[0], str):
                    print(f"[blob-proxy] getBlobs slot={slot} via {base}: "
                          f"expected 1 blob for {vh[:20]}, got {len(data)}",
                          file=sys.stderr, flush=True)
                    break
                by_vh[vh] = _norm_hex(data[0])
            if len(by_vh) == len(versioned_hashes):
                return by_vh
        return None

    def _beacon_blobs_by_vh(self, slot, versioned_hashes):
        """Fetch sidecars from the real beacon(s) and return a {versioned_hash: blob_hex} map.

        Tries the primary beacon, then any configured secondaries (a transient
        403/5xx on one free beacon should not stall the node). Returns None only
        if every beacon errors / no longer retains the slot."""
        beacons = ([REAL_BEACON] if REAL_BEACON else []) + SECONDARY_BEACONS
        if not beacons:
            return None
        for base in beacons:
            url = f"{base}/eth/v1/beacon/blob_sidecars/{slot}"
            try:
                req = Request(url, headers={"User-Agent": _UA})
                with urlopen(req, timeout=20) as r:
                    data = json.loads(r.read())
            except Exception as e:
                print(f"[blob-proxy] beacon miss slot={slot} via {base}: {e}",
                      file=sys.stderr, flush=True)
                continue
            sidecars = data.get("data") or []
            by_vh = {}
            for sc in sidecars:
                commitment = sc.get("kzg_commitment")
                blob = sc.get("blob")
                if not commitment or not isinstance(blob, str):
                    continue
                try:
                    vh = kzg_commitment_to_versioned_hash(commitment)
                except Exception:
                    continue
                by_vh[vh] = _norm_hex(blob)
            if by_vh:
                return by_vh
        return None

    def _blockscout_blobs_by_vh(self, versioned_hashes):
        """Fallback: fetch each requested blob's bytes from Blockscout, keyed by versioned_hash.

        Returns a {versioned_hash: blob_hex} map, or None if ANY requested blob
        is missing its bytes (blob_data=null) — a partial set is unusable."""
        by_vh = {}
        for vh in versioned_hashes:
            try:
                req = Request(f"{BLOCKSCOUT}/{vh}", headers={"User-Agent": "blob-proxy/1.0"})
                with urlopen(req, timeout=30) as r:
                    d = json.loads(r.read())
            except Exception as e:
                print(f"[blob-proxy] blockscout error {vh[:20]}: {e}", file=sys.stderr, flush=True)
                return None
            blob = d.get("blob_data")
            if not blob or not isinstance(blob, str):
                print(f"[blob-proxy] blockscout has no bytes for {vh[:20]} (null)",
                      file=sys.stderr, flush=True)
                return None
            by_vh[_norm_hex(vh)] = _norm_hex(blob)
        return by_vh or None

    def do_GET(self):
        parsed = urlparse(self.path)
        m = re.match(r'^/eth/v1/beacon/blobs/(\d+)$', parsed.path)
        if not m:
            self.proxy_to_real_beacon(self.path)
            return
        slot = m.group(1)
        params = parse_qs(parsed.query)
        versioned_hashes = [_norm_hex(h) for h in params.get('versioned_hashes', [])]
        # The hashes are placed into outbound URLs; accept only well-formed
        # EIP-4844 versioned hashes (0x01 + 31 bytes).
        bad = [h for h in versioned_hashes if not VERSIONED_HASH.match(h)]
        if bad:
            self.send_error(400, f"invalid versioned_hash: {bad[0][:80]}")
            return

        # 1. Standard getBlobs endpoint — required for Gloas (Glamsterdam) slots.
        by_vh = self._beacon_blobs_direct(slot, versioned_hashes)
        source = "beacon-getblobs"
        # 2. Sidecar translation — for beacons that lack getBlobs (pre-Fulu).
        if by_vh is None:
            by_vh = self._beacon_blobs_by_vh(slot, versioned_hashes)
            source = "beacon-sidecars"
        # 3. Fallback to Blockscout only for pruned slots.
        if by_vh is None:
            by_vh = self._blockscout_blobs_by_vh(versioned_hashes)
            source = "blockscout"
        if by_vh is None:
            self.send_error(502, f"no blob source has slot {slot}")
            return

        # Nitro wants a FLAT array of blob hex strings, one per requested
        # versioned_hash, in request order. If no versioned_hashes were
        # supplied, return every blob we found for the slot.
        if versioned_hashes:
            blobs_out = []
            for vh in versioned_hashes:
                blob = by_vh.get(vh)
                if blob is None:
                    self.send_error(
                        502,
                        f"blob for versioned_hash {vh} not found in slot {slot} ({source})")
                    return
                blobs_out.append(blob)
        else:
            blobs_out = list(by_vh.values())

        print(f"[blob-proxy] slot={slot} served {len(blobs_out)} blob(s) from {source}",
              file=sys.stderr, flush=True)
        self._send_json(json.dumps({"data": blobs_out}).encode())


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 3500
    # Bind to loopback only — the proxy is consumed by the local Nitro container
    # over host networking (127.0.0.1:3500) and must never be externally reachable.
    print(f"[blob-proxy] Listening on 127.0.0.1:{port}", file=sys.stderr, flush=True)
    HTTPServer(("127.0.0.1", port), BlobProxyHandler).serve_forever()
