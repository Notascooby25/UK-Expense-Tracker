#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

export PODMAN_COMPOSE_PROVIDER=podman-compose

cd "$ROOT_DIR"
exec podman compose "$@"
