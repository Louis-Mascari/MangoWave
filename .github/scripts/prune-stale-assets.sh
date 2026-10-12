#!/usr/bin/env bash
# Delete hashed build assets that no deployed build has used for a while.
#
# Deploys keep earlier builds' files under assets/ so a tab opened before a
# deploy can still lazy-load its chunks. This removes the ones that are BOTH
#   - absent from the build that was just deployed, and
#   - last uploaded more than <retention-days> ago.
#
# The deploy re-uploads every current asset each time, so an object's
# LastModified is the last deploy that still shipped it, not its first upload.
#
# Usage: prune-stale-assets.sh <bucket> <dist-assets-dir> [retention-days]
# Set DRY_RUN=1 to list what would be deleted without deleting anything.
set -euo pipefail

bucket="${1:?usage: prune-stale-assets.sh <bucket> <dist-assets-dir> [retention-days]}"
dist_assets="${2:?usage: prune-stale-assets.sh <bucket> <dist-assets-dir> [retention-days]}"
retention_days="${3:-14}"
prefix='assets/'

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
export LC_ALL=C

# Keys of the build that is live now.
find "$dist_assets" -type f -printf "${prefix}%P\n" | sort >"$workdir/current"
if [ ! -s "$workdir/current" ]; then
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

cutoff="$(date -u -d "-${retention_days} days" +%s)"

# With no objects under the prefix the CLI prints nothing, or a document with
# no Contents key; both yield an empty list here. A LastModified that cannot be
# parsed aborts the run instead of being guessed at.
jq -r --argjson cutoff "$cutoff" '
  (.Contents // [])[]
  | select(
      (.LastModified | sub("(\\.[0-9]+)?(Z|\\+00:00)$"; "Z") | fromdateiso8601) < $cutoff
    )
  | .Key
' "$workdir/listing.json" | sort >"$workdir/old"

# Old and not part of the current build.
comm -23 "$workdir/old" "$workdir/current" >"$workdir/stale"

total="$(jq -r '(.Contents // []) | length' "$workdir/listing.json")"
total="${total:-0}"
stale="$(wc -l <"$workdir/stale" | tr -d ' ')"
echo "${total} objects under ${prefix}, ${stale} stale (not in this build, older than ${retention_days} days)."

if [ "$stale" -eq 0 ]; then
  exit 0
fi

if [ "${DRY_RUN:-0}" = "1" ]; then
  sed 's/^/would delete: /' "$workdir/stale"
  exit 0
fi

# DeleteObjects accepts at most 1000 keys per request.
split -l 1000 -d "$workdir/stale" "$workdir/batch-"
failed=0
for batch in "$workdir"/batch-*; do
  jq -R . "$batch" | jq -s -c '{Objects: map({Key: .}), Quiet: true}' >"$workdir/request.json"
  # A partial failure still exits 0 and reports the keys under Errors.
  aws s3api delete-objects \
    --bucket "$bucket" \
    --delete "file://$workdir/request.json" \
    --output json >"$workdir/response.json"
  errors="$(jq -r '(.Errors // []) | length' "$workdir/response.json")"
  errors="${errors:-0}"
  if [ "$errors" -ne 0 ]; then
    jq -r '.Errors[] | "failed to delete \(.Key): \(.Code)"' "$workdir/response.json" >&2
    failed=$((failed + errors))
  fi
done

if [ "$failed" -ne 0 ]; then
  echo "${failed} of ${stale} stale objects could not be deleted." >&2
  exit 1
fi
echo "Deleted ${stale} stale objects."
