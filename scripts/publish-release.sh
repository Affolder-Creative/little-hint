#!/usr/bin/env bash
set -euo pipefail
: "${IMAGE:?}" "${VERSION:?}" "${RELEASE_SHA:?}" "${RELEASE_TAG:?}" "${GH_TOKEN:?}"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$RELEASE_SHA" =~ ^[a-f0-9]{40}$ && "$RELEASE_TAG" == "v$VERSION" ]]
test "$(gh release view "$RELEASE_TAG" --json isDraft --jq .isDraft)" = true
mkdir -p .local/release-assets .local/deployment
node scripts/registry-tags.mjs > .local/registry-tags.json
exists() { node -e 'process.exit(JSON.parse(require("fs").readFileSync(".local/registry-tags.json")).includes(process.argv[1])?0:1)' "$1"; }
refs=()
for arch in amd64 arm64; do
  dir=".local/artifacts/release-$arch"
  test -s "$dir/image.oci.tar"
  # Recheck artifact identity before giving this job package write permissions.
  ARCH="$arch" DIR="$dir" node --input-type=module -e '
    import fs from "node:fs"; import assert from "node:assert/strict";
    const i=JSON.parse(fs.readFileSync(`${process.env.DIR}/image-inspect.json`))[0];
    assert.equal(i.Architecture,process.env.ARCH);
    assert.equal(i.Config.Labels["org.opencontainers.image.version"],process.env.VERSION);
    assert.equal(i.Config.Labels["org.opencontainers.image.revision"],process.env.RELEASE_SHA);
  '
  cp "$dir/little-hint-$VERSION-linux-$arch.tar.gz" .local/release-assets/
  cp "$dir/little-hint-$VERSION-compliance-$arch.tar.gz" .local/release-assets/
  cp "$dir/image.spdx.json" ".local/release-assets/little-hint-$VERSION-$arch.spdx.json"
  ref="$IMAGE:sha-$RELEASE_SHA-$arch"
  if ! exists "$VERSION"; then
    if ! exists "sha-$RELEASE_SHA-$arch"; then
      # --all retains the BuildKit provenance and SBOM attestations.
      skopeo copy --all "oci-archive:$dir/image.oci.tar" "docker://$ref"
    fi
    refs+=("$ref")
  fi
done
if ! exists "$VERSION"; then
  docker buildx imagetools create --tag "$IMAGE:$VERSION" "${refs[@]}"
fi
# All platform configs were checked in the image jobs, including reused images.
docker buildx imagetools inspect "$IMAGE:$VERSION" --raw > .local/release-assets/image-manifest.json
digest=$(docker buildx imagetools inspect "$IMAGE:$VERSION" --format '{{.Manifest.Digest}}')
[[ "$digest" =~ ^sha256:[a-f0-9]{64}$ ]]
IMAGE_DIGEST="$digest" node scripts/release-assets.mjs
cp compose.yaml compose.ghcr.yaml compose.local.yaml .env.production.example LICENSE .local/deployment/
cp docs/RELEASING.md docs/LICENSING.md docs/DEPLOYMENT.md .local/deployment/
# Public deployment samples do not activate an unlicensed optional component.
sed -i 's/^COMPOSE_PROFILES=backup$/COMPOSE_PROFILES=/' .local/deployment/.env.production.example
printf 'LITTLE_HINT_IMAGE=%s@%s\n' "$IMAGE" "$digest" >> .local/deployment/.env.production.example
tar -czf ".local/release-assets/little-hint-$VERSION-deploy.tar.gz" -C .local/deployment .
(
  cd .local/release-assets
  find . -maxdepth 1 -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
)
gh release upload "$RELEASE_TAG" .local/release-assets/* --clobber
# Update moving aliases only for the highest version in their series, so
# retrying an older draft cannot roll users back.
node scripts/registry-tags.mjs > .local/registry-tags.json
while IFS= read -r alias; do
  docker buildx imagetools create --tag "$IMAGE:$alias" "$IMAGE@$digest"
done < <(node scripts/release-aliases.mjs .local/registry-tags.json "$VERSION")
gh release edit "$RELEASE_TAG" --notes-file .local/release-notes.md --draft=false --latest=false
# Mark latest only when this is the highest stable version in the registry.
if node scripts/release-aliases.mjs .local/registry-tags.json "$VERSION" | grep -qx latest; then
  gh release edit "$RELEASE_TAG" --latest
fi
