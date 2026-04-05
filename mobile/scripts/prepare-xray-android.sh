#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS_DIR="$ROOT_DIR/android/app/src/main/assets"
XRAY_TAG="${XRAY_TAG:-v26.3.27}"

mkdir -p "$ASSETS_DIR"

echo "Preparing Xray Android binaries ($XRAY_TAG)..."

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

download_with_resume() {
  local url="$1"
  local out="$2"
  echo "Downloading $(basename "$out")..."
  curl -fL \
    --retry 8 \
    --retry-delay 2 \
    --retry-all-errors \
    -C - \
    -o "$out" \
    "$url"
}

download_with_resume "https://github.com/XTLS/Xray-core/releases/download/$XRAY_TAG/Xray-android-arm64-v8a.zip" "$TMP_DIR/xray-arm64.zip"
download_with_resume "https://github.com/XTLS/Xray-core/releases/download/$XRAY_TAG/Xray-android-amd64.zip" "$TMP_DIR/xray-amd64.zip"

python3 - <<'PY' "$TMP_DIR/xray-arm64.zip" "$TMP_DIR/xray-amd64.zip" "$ASSETS_DIR"
import sys, zipfile
from pathlib import Path

arm64_zip, amd64_zip, out_dir = sys.argv[1], sys.argv[2], Path(sys.argv[3])
out_dir.mkdir(parents=True, exist_ok=True)

def extract_xray(zip_path, target_name):
    with zipfile.ZipFile(zip_path) as z:
        name = next((n for n in z.namelist() if n.endswith('/xray') or n == 'xray'), None)
        if not name:
            raise SystemExit(f'xray not found in {zip_path}')
        (out_dir / target_name).write_bytes(z.read(name))

extract_xray(arm64_zip, 'xray-arm64-v8a')
extract_xray(amd64_zip, 'xray-amd64')
print('written', out_dir / 'xray-arm64-v8a', out_dir / 'xray-amd64')
PY

chmod +x "$ASSETS_DIR/xray-arm64-v8a" "$ASSETS_DIR/xray-amd64"

echo "Done:"
ls -lh "$ASSETS_DIR/xray-arm64-v8a" "$ASSETS_DIR/xray-amd64"
