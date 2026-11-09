#!/usr/bin/env bash
# Rebuild the self-hosted Supabase client at src/js/vendor/supabase-js.js.
#
# Why self-hosted: login and MFA used to import supabase-js from esm.sh at
# runtime. That put a third-party CDN, with no integrity check, inside the
# auth path, and it blocks enforcing the site's `script-src 'self'` CSP.
#
# Usage: bash tools/vendor/build-supabase.sh [version]
# Then:  bun run assets:stamp   (the asset version hash covers src/js)
set -euo pipefail

VERSION="${1:-2.45.0}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cd "$WORK"
printf '{"name":"supabase-vendor-build","private":true,"type":"module"}' > package.json
bun add "@supabase/supabase-js@${VERSION}" >/dev/null
printf 'export { createClient } from "@supabase/supabase-js";\n' > entry.js
bun build entry.js --target=browser --format=esm --minify --outfile=bundle.js >/dev/null

OUT="$ROOT/src/js/vendor/supabase-js.js"
{
  printf '/*! @supabase/supabase-js %s (MIT), bundled for the browser by tools/vendor/build-supabase.sh.\n' "$VERSION"
  printf ' *  Self-hosted so pages load no third-party script. Do not edit; regenerate instead. */\n'
  cat bundle.js
} > "$OUT"

echo "Wrote $OUT"
sha256sum "$OUT"
