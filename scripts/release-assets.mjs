import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const { IMAGE, IMAGE_DIGEST, VERSION, RELEASE_SHA, RELEASE_TAG } = process.env;
const release = JSON.parse(
  execFileSync("gh", ["release", "view", RELEASE_TAG, "--json", "body"], {
    encoding: "utf8",
  }),
);
const download = `https://github.com/kaffolder7/little-hint/releases/download/${RELEASE_TAG}`;
const instructions = `## Container downloads\n\nEarly 0.x release. Support is provided as time allows, with no response-time or uptime guarantee. Review the [installation and acceptance checklist](https://github.com/kaffolder7/little-hint/blob/${RELEASE_TAG}/docs/DEPLOYMENT.md) before storing important data.\n\nSupported platforms: Linux AMD64 and ARM64. App and worker use the same image.\n\n\`\`\`sh\ndocker pull ${IMAGE}:${VERSION}\n# Pin exactly these bytes:\ndocker pull ${IMAGE}@${IMAGE_DIGEST}\n\`\`\`\n\nImage index digest: \`${IMAGE_DIGEST}\`\nSource commit: \`${RELEASE_SHA}\`\n\nDownload the deployment bundle, copy .env.production.example to .env.production, and fill in your runtime settings, including SMTP and your HTTPS APP_URL. Leave COMPOSE_PROFILES empty until the optional backup sidecar is configured. Arrange backups and verify a restore before real use. Then run:\n\n\`\`\`sh\ndocker compose --env-file .env.production -f compose.yaml -f compose.ghcr.yaml up -d\ndocker compose --env-file .env.production -f compose.yaml -f compose.ghcr.yaml exec app node dist/server/cli.js bootstrap you@example.com\n\`\`\`\n\nReplace you@example.com with your administrator email, then sign in at APP_URL within 24 hours. Production sign-in requires working SMTP. Route HTTPS to app port 3000; compose.yaml does not publish a host port. A host-based proxy can use compose.local.yaml for a loopback binding; include that overlay in every Compose command.\n\nFor an image archive, select your architecture, verify SHA256SUMS, and load it:\n\n\`\`\`sh\nsha256sum --check SHA256SUMS --ignore-missing\ngzip -dc little-hint-${VERSION}-linux-amd64.tar.gz | docker load\n\`\`\`\n\nWhen using a loaded archive, set LITTLE_HINT_IMAGE=${IMAGE}:${VERSION}; the registry digest reference in the example requires a registry pull. These archives contain Little Hint only; PostgreSQL and the optional backup sidecar are separate images.\n\nThe compliance archives include third-party notices and source-bundle hashes. The three separate *-sources.tar.gz downloads contain reviewed corresponding sources, patches, build recipes, and Rust crates. Download those alongside your image; they are shared by both architectures. SPDX SBOMs describe each platform image. BuildKit provenance and SBOM attestations accompany the GHCR image index.\n\nLicense: PolyForm Perimeter 1.0.0. Copyright 2026 Affolder Creative. This is source-available software.\n\n[Release downloads](${download}/SHA256SUMS)\n`;
// Replace the generated section when recovering a partially completed draft.
const body = release.body.split("\n<!-- little-hint-artifacts -->")[0];
writeFileSync(
  ".local/release-notes.md",
  `${body}\n<!-- little-hint-artifacts -->\n${instructions}`,
);
writeFileSync(
  ".local/release-assets/IMAGE.txt",
  `${IMAGE}@${IMAGE_DIGEST}\nversion=${VERSION}\nrevision=${RELEASE_SHA}\n`,
);
writeFileSync(".local/release-assets/INSTALL.md", instructions);
