#!/bin/bash
set -euo pipefail

stage="$1"
origin="$2"
output="$3"
preset="${4:-mobile}"
tool="$(dirname "$0")/node_modules/.bin/lighthouse"
if [[ "$preset" == "desktop" ]]; then
  set -- --preset=desktop
elif [[ "$preset" != "mobile" ]]; then
  printf 'Choose mobile or desktop.\n' >&2
  exit 2
else
  set --
fi
mkdir -p "$output"

for run in 1 2 3; do
  "$tool" "$origin/" --quiet --output=json --output-path="$output/$stage-$preset-lighthouse-$run.json" \
    --chrome-flags='--headless --no-sandbox' --only-categories=performance,accessibility,best-practices,seo \
    "$@"
done
