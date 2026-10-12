#!/usr/bin/env bash
# Delete hashed build assets that were retired from the build long enough ago.
#
# Deploys keep earlier builds' files under assets/ so a tab opened before a
# deploy can still lazy-load its chunks. This removes an object only when it is
#   - absent from the build that was just deployed, and
#   - estimated to have been RETIRED more than <retention-days> ago.
#
# The deploy re-uploads every current asset, so an object's LastModified is the
# last deploy that shipped it. The retention clock must not start there: with
# deploys further apart than the retention period, the previous build would
# already look expired on the very deploy that replaces it. It starts when the
# file was retired, i.e. at the next deploy after its LastModified. That is read
# off the listing itself: the smallest LastModified among all assets/ objects
# that is later than the object's own by more than one upload window. The
# current build was uploaded moments ago, so such a timestamp always exists.
# If an intermediate deploy left no object behind, a later deploy's time is
# used instead, so the estimate is never too early: files may be kept longer
# than necessary, never shorter.
#
# Net effect: a chunk dropped by this deploy always survives it, and is removed
# by the first later deploy that runs <retention-days> after the one that
# replaced it.
#
# Usage: prune-stale-assets.sh <bucket> <dist-assets-dir> [retention-days]
# Set DRY_RUN=1 to list what would be deleted without deleting anything.
set -euo pipefail

bucket="${1:?usage: prune-stale-assets.sh <bucket> <dist-assets-dir> [retention-days]}"
dist_assets="${2:?usage: prune-stale-assets.sh <bucket> <dist-assets-dir> [retention-days]}"
retention_days="${3:-14}"
prefix='assets/'
# Objects uploaded within this many seconds of each other are one deploy.
upload_window=600

if ! [[ "$retention_days" =~ ^[0-9]+$ ]]; then
  echo "retention-days must be a whole number, got: ${retention_days}" >&2
  exit 1
fi
if [ ! -d "$dist_assets" ]; then
  echo "Not a directory: ${dist_assets}" >&2
  exit 1
fi

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

# Keys of the build that is live now, as a JSON array.
if [ -n "$(find "$dist_assets" -type f -name $'*\n*' -print -quit)" ]; then
  echo "A file name in ${dist_assets} contains a newline; refusing to prune." >&2
  exit 1
fi
find "$dist_assets" -type f -printf "${prefix}%P\n" | jq -R . | jq -s . >"$workdir/current.json"
if [ "$(jq 'length' "$workdir/current.json")" -eq 0 ]; then
  # An empty build would make every object in the bucket look stale.
  echo "No files in ${dist_assets}; refusing to prune." >&2
  exit 1
fi

# The CLI follows continuation tokens itself and, for JSON output, merges all
# pages into one document, so this is complete beyond 1000 objects.
aws s3api list-objects-v2 \
  --bucket "$bucket" \
  --prefix "$prefix" \
  --output json >"$workdir/listing.json"
if [ ! -s "$workdir/listing.json" ]; then
  # With no objects under the prefix some CLI versions print nothing at all.
  echo '{}' >"$workdir/listing.json"
fi

cutoff="$(date -u -d "-${retention_days} days" +%s)"

# Everything from here to the request payloads stays inside jq, so a key is
# never split on whitespace or newlines. A LastModified that cannot be parsed,
# or a key outside the prefix, aborts the run instead of being guessed at.
jq -c \
  --argjson cutoff "$cutoff" \
  --argjson window "$upload_window" \
  --arg prefix "$prefix" \
  --slurpfile current "$workdir/current.json" '
  ($current[0] | map({key: ., value: true}) | from_entries) as $live
  | [ (.Contents // [])[]
      | { Key,
          t: (.LastModified | sub("(\\.[0-9]+)?(Z|\\+00:00)$"; "Z") | fromdateiso8601) } ] as $all
  | ($all | map(.t) | unique) as $times
  | [ $all[]
      | select($live[.Key] | not)
      | . as $o
      | (first($times[] | select(. > $o.t + $window)) // null) as $retired
      | select($retired != null and $retired < $cutoff)
      | .Key ] as $stale
  | if any($stale[]; startswith($prefix) | not)
    then error("refusing to delete a key outside \($prefix)")
    else { total: ($all | length), stale: $stale }
    end
' "$workdir/listing.json" >"$workdir/plan.json"

total="$(jq -r '.total' "$workdir/plan.json")"
stale="$(jq -r '.stale | length' "$workdir/plan.json")"
echo "${total} objects under ${prefix}, ${stale} stale (not in this build, retired more than ${retention_days} days ago)."

if [ "$stale" -eq 0 ]; then
  exit 0
fi

if [ "${DRY_RUN:-0}" = "1" ]; then
  # Printed JSON-encoded so an odd key is unambiguous in the log.
  jq -r '.stale[] | "would delete: \(@json)"' "$workdir/plan.json"
  exit 0
fi

# DeleteObjects accepts at most 1000 keys per request. Each batch is one line
# of compact JSON; newlines inside keys are escaped there, so reading by line
# is safe.
failed=0
while IFS= read -r request; do
  printf '%s\n' "$request" >"$workdir/request.json"
  # A partial failure still exits 0 and reports the keys under Errors.
  aws s3api delete-objects \
    --bucket "$bucket" \
    --delete "file://$workdir/request.json" \
    --output json >"$workdir/response.json"
  if [ -s "$workdir/response.json" ]; then
    errors="$(jq -r '(.Errors // []) | length' "$workdir/response.json")"
    if [ "$errors" -ne 0 ]; then
      jq -r '.Errors[] | "failed to delete \(.Key | @json): \(.Code)"' "$workdir/response.json" >&2
      failed=$((failed + errors))
    fi
  fi
done < <(jq -c '.stale | _nwise(1000) | {Objects: map({Key: .}), Quiet: true}' "$workdir/plan.json")

if [ "$failed" -ne 0 ]; then
  echo "${failed} of ${stale} stale objects could not be deleted." >&2
  exit 1
fi
echo "Deleted ${stale} stale objects."
