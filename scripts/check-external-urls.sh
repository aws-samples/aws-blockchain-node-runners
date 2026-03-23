#!/usr/bin/env bash
# Pre-commit hook: block downloads of external binaries from untrusted sources.
# Scans staged .sh files for wget/curl commands fetching from non-allowlisted domains.

set -euo pipefail

# Fully trusted domains (any path allowed)
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

# Trusted repo prefixes (domain + org/repo path)
TRUSTED_REPOS=(
  "github.com/docker/compose"
  "github.com/peak/s5cmd"
  "github.com/MystenLabs/sui"
  "github.com/anza-xyz/agave"
  "github.com/bnb-chain/bsc"
  "github.com/stacks-network/stacks-core"
  "gitlab.com/tezos/tezos"
)

# Trusted org prefixes (domain + org, any repo under it allowed)
TRUSTED_ORGS=(
  "github.com/NethermindEth"
  "github.com/stacks-network"
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

is_trusted_url() {
  local url="$1"
  local domain
  domain=$(echo "$url" | awk -F/ '{print $3}' | sed 's/:.*//')

  # Skip variable-based domains (can't resolve)
  [[ "$domain" == *'$'* ]] && return 0

  # Check fully trusted domains
  for allowed in "${TRUSTED_DOMAINS[@]}"; do
    if [ "$domain" = "$allowed" ] || [[ "$domain" == *."$allowed" ]]; then
      return 0
    fi
  done

  # For URLs with variables in the path, check if the domain has any trusted entries
  if [[ "$url" == *'$'* ]]; then
    for repo in "${TRUSTED_REPOS[@]}" "${TRUSTED_ORGS[@]}"; do
      if [[ "$repo" == "$domain/"* ]]; then
        return 0
      fi
    done
    return 1
  fi

  # Extract domain/org/repo from URL
  local path_prefix
  path_prefix=$(echo "$url" | awk -F/ '{print $3"/"$4"/"$5}')
  local org_prefix
  org_prefix=$(echo "$url" | awk -F/ '{print $3"/"$4}')

  # Check trusted repos
  for repo in "${TRUSTED_REPOS[@]}"; do
    if [ "$path_prefix" = "$repo" ]; then
      return 0
    fi
  done

  # Check trusted orgs
  for org in "${TRUSTED_ORGS[@]}"; do
    if [ "$org_prefix" = "$org" ]; then
      return 0
    fi
  done

  return 1
}

for file in $FILES; do
  # Extract lines with wget or curl that contain URLs
  matches=$(grep -nE '(wget|curl)\s' "$file" 2>/dev/null | grep -oE 'https?://[^"'\'' <>`]+' || true)

  for url in $matches; do
    if ! is_trusted_url "$url"; then
      echo "BLOCKED: $file downloads from untrusted source"
      echo "  URL: $url"
      BLOCKED=1
    fi
  done
done

if [ "$BLOCKED" -eq 1 ]; then
  echo ""
  echo "To allow a source, add it to TRUSTED_DOMAINS, TRUSTED_REPOS, or TRUSTED_ORGS"
  echo "in scripts/check-external-urls.sh"
  exit 1
fi
