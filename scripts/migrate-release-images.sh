#!/usr/bin/env bash
set -euo pipefail
: "${GH_TOKEN:?}" "${GITHUB_ACTOR:?}" "${GITHUB_STEP_SUMMARY:?}"
source_image=ghcr.io/kaffolder7/little-hint
target_image=ghcr.io/affolder-creative/little-hint
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
printf '%s' "$GH_TOKEN" | skopeo login --authfile "$work/auth.json" --username "$GITHUB_ACTOR" --password-stdin ghcr.io
node scripts/registry-tags.mjs > "$work/existing-tags.json"
skopeo list-tags --no-creds "docker://$source_image" | jq -r '.Tags[]' > "$work/tags"
while IFS= read -r tag; do
  [[ "$tag" =~ ^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$ ]]
  skopeo inspect --raw --no-creds "docker://$source_image:$tag" > "$work/source.json"
  source_digest=$(skopeo manifest-digest "$work/source.json")
  if jq -e --arg tag "$tag" 'index($tag) != null' "$work/existing-tags.json" > /dev/null; then
    skopeo inspect --raw --authfile "$work/auth.json" "docker://$target_image:$tag" > "$work/target.json"
    target_digest=$(skopeo manifest-digest "$work/target.json")
    if [[ "$source_digest" != "$target_digest" ]]; then
      echo "Refusing to overwrite different destination bytes for $tag" >&2
      exit 1
    fi
  else
    skopeo copy --all --preserve-digests --src-no-creds --dest-authfile "$work/auth.json" "docker://$source_image@$source_digest" "docker://$target_image:$tag"
    skopeo inspect --raw --authfile "$work/auth.json" "docker://$target_image:$tag" > "$work/target.json"
    test "$source_digest" = "$(skopeo manifest-digest "$work/target.json")"
  fi
  printf -- '- `%s:%s` verified at `%s`\n' "$target_image" "$tag" "$source_digest" >> "$GITHUB_STEP_SUMMARY"
done < "$work/tags"
