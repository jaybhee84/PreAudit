#!/bin/bash
set -euo pipefail
app="$1"
output="$2"
[[ -d "$app" && "$app" == *.app ]] || { echo "Application bundle missing: $app" >&2; exit 1; }
staging=$(mktemp -d)
ditto "$app" "$staging/PBB PreAudit.app"
ln -s /Applications "$staging/Applications"
mkdir -p "$(dirname "$output")"
hdiutil create -volname "PBB PreAudit" -srcfolder "$staging" -ov -format UDZO "$output"
hdiutil verify "$output"
