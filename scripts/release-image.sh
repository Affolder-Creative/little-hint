#!/usr/bin/env bash
set -euo pipefail
: "${IMAGE:?}" "${VERSION:?}" "${RELEASE_SHA:?}" "${ARCH:?}"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$RELEASE_SHA" =~ ^[a-f0-9]{40}$ && "$ARCH" =~ ^(amd64|arm64)$ ]]
mkdir -p .local/release/compliance
case "${1:-}" in
  find)
    node scripts/registry-tags.mjs > .local/registry-tags.json
    for tag in "$VERSION" "sha-$RELEASE_SHA-$ARCH"; do
      if node -e 'process.exit(JSON.parse(require("fs").readFileSync(".local/registry-tags.json")).includes(process.argv[1])?0:1)' "$tag"; then
        skopeo copy --all "docker://$IMAGE:$tag" oci-archive:.local/image.oci.tar
        echo 'found=true' >> "$GITHUB_OUTPUT"
        exit 0
      fi
    done
    echo 'found=false' >> "$GITHUB_OUTPUT"
    ;;
  load)
    skopeo copy --override-arch "$ARCH" oci-archive:.local/image.oci.tar docker-daemon:little-hint:release
    docker image inspect little-hint:release > .local/release/image-inspect.json
    node --input-type=module -e '
      import fs from "node:fs"; import assert from "node:assert/strict";
      const i=JSON.parse(fs.readFileSync(".local/release/image-inspect.json"))[0];
      assert.equal(i.Architecture,process.env.ARCH);
      assert.equal(i.Os,"linux");
      assert.equal(i.Config.Labels["org.opencontainers.image.revision"],process.env.RELEASE_SHA);
      assert.equal(i.Config.Labels["org.opencontainers.image.version"],process.env.VERSION);
      assert.equal(i.Config.Labels["org.opencontainers.image.source"],"https://github.com/kaffolder7/little-hint");
    '
    cid=$(docker create little-hint:release)
    trap 'docker rm "$cid" >/dev/null' EXIT
    docker cp "$cid:/app/compliance-report/." .local/release/compliance/
    docker cp "$cid:/app/compliance" .local/release/compliance/policy
    docker cp "$cid:/app/LICENSE" .local/release/compliance/LICENSE
    docker cp "$cid:/app/dist/client/third-party-notices.txt" .local/release/compliance/browser-notices.txt
    ;;
  archive)
    docker tag little-hint:release "$IMAGE:$VERSION"
    docker save "$IMAGE:$VERSION" | gzip -n > ".local/release/little-hint-$VERSION-linux-$ARCH.tar.gz"
    # Exercise the user download path and compare the loaded image's config ID.
    expected=$(docker image inspect "$IMAGE:$VERSION" --format '{{.Id}}')
    docker image rm "$IMAGE:$VERSION" >/dev/null
    gzip -dc ".local/release/little-hint-$VERSION-linux-$ARCH.tar.gz" | docker load
    test "$(docker image inspect "$IMAGE:$VERSION" --format '{{.Id}}')" = "$expected"
    # Shared source bundles are published once. Each platform keeps their
    # hashes and coverage in compliance/sources/BUNDLES.json.
    if [[ "$ARCH" == amd64 ]]; then
      mv .local/release/compliance/sources/*.tar.gz .local/release/
    else
      rm .local/release/compliance/sources/*.tar.gz
    fi
    tar -czf ".local/release/little-hint-$VERSION-compliance-$ARCH.tar.gz" -C .local/release compliance
    mv .local/image.oci.tar .local/release/image.oci.tar
    ;;
  *) exit 2 ;;
esac
