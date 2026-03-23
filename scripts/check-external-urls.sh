#!/usr/bin/env bash
# Pre-commit hook: block downloads of external binaries from untrusted sources.
# Scans staged .sh files for wget/curl commands fetching from non-allowlisted domains.

set -euo pipefail

TRUSTED_DOMAINS=(
  "s3.amazonaws.com"
  "awscli.amazonaws.com"
  "download.docker.com"
  "sh.rustup.rs"
  "raw.githubusercontent.com"
  "nvidia.github.io"
  "us.download.nvidia.com"
  "cdrdv2-public.intel.com"
  "snapshots.vechainlabs.io"
  "api.github.com"
  "docs.solana.com"
  "metrics.solana.com"
  "169.254.169.254"
  "localhost"
)

BLOCKED=0

# Accept files as arguments (pre-commit framework) or fall back to git staged files
if [ $# -gt 0 ]; then
  FILES="$*"
else
  FILES=$(git diff --cached --name-only --diff-filter=ACM -- '*.sh' || true)
fi

if [ -z "$FILES" ]; then
  exit 0
fi

for file in $FILES; do
  # Extract lines with wget or curl that contain URLs
  matches=$(grep -nE '(wget|curl)\s' "$file" 2>/dev/null | grep -oE 'https?://[^"'\'' <>`]+' || true)

  for url in $matches; do
    domain=$(echo "$url" | awk -F/ '{print $3}' | sed 's/:.*//')

    # Skip variable-based URLs
    [[ "$domain" == *'$'* ]] && continue

    trusted=false
    for allowed in "${TRUSTED_DOMAINS[@]}"; do
      if [ "$domain" = "$allowed" ] || [[ "$domain" == *."$allowed" ]]; then
        trusted=true
        break
      fi
    done

    if [ "$trusted" = false ]; then
      echo "BLOCKED: $file downloads from untrusted domain: $domain"
      echo "  URL: $url"
      BLOCKED=1
    fi
  done
done

if [ "$BLOCKED" -eq 1 ]; then
  echo ""
  echo "To allow a domain, add it to TRUSTED_DOMAINS in scripts/check-external-urls.sh"
  exit 1
fi
