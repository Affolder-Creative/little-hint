# Transfer to Affolder Creative

Target repository: `https://github.com/Affolder-Creative/little-hint`.
Public website: `https://littlehint.affoldercreative.com/`, unchanged.
Release image: `ghcr.io/affolder-creative/little-hint`.
Staging image: `ghcr.io/affolder-creative/little-hint-staging`, kept private.

These source changes prepare the project for the transfer. They do not transfer
GitHub ownership, copy container images, change DNS, or update running deployments.

## Transfer and source changes

1. Confirm the target organization permits public repositories, Actions, Pages,
   and container package creation. Confirm no target repository named `little-hint`
   already exists. Let active release/publish jobs finish before transferring.
2. Transfer the existing repository through GitHub Settings. Do not create a new
   repository at the old path: GitHub redirects old repository URLs, and reusing
   that path removes those redirects. Existing historical changelog links can
   continue using the old URLs.
3. Merge the organization-reference changes immediately after transfer, before
   starting a new release. They update the release allowlist, image names, OCI
   source label and validation, organization package API, generated download URLs,
   staging image casing, and website links. The old release allowlist intentionally
   cannot publish from the new owner until these changes land.
4. Update each local clone's origin to
   `https://github.com/Affolder-Creative/little-hint.git`. Recheck organization
   Actions policies, workflow write permissions, rulesets, GitHub App access,
   release automation, deployment environments, variables, secrets, and Coolify's
   repository integration. Existing webhooks and secrets transfer with the repo,
   but organization policies and app installation scope still need verification.

## GHCR packages

GHCR packages belong to their account or organization. Transferring the repository
does not change their namespace, and the repository connection/access can be lost.
Keep the existing personal packages while migrating consumers.

1. Publish new releases to `ghcr.io/affolder-creative/little-hint` through the
   transferred repository's updated release workflow. Confirm the package is
   connected to that repository and its Actions workflow can write to it. Set
   the release package public and verify anonymous pulls. Public repository
   visibility alone does not make a newly created package public.
2. If existing versions must be available in the new namespace, copy their
   reviewed image indexes and all referenced manifests rather than rebuilding
   the same release version. For each selected version or alias, use an
   authenticated OCI copy tool that preserves all platforms, attestations and
   digests, for example `skopeo copy --all --preserve-digests`. Compare the source
   and destination index digests, check both AMD64 and ARM64, and test anonymous
   pulls after making the destination release package public. Copied historical
   images retain their original source labels; do not alter their bytes or retry
   an already published release just to relabel it.
3. Historical GitHub release download bundles still contain their original
   `ghcr.io/kaffolder7/little-hint` references. Keep that public package available
   so those downloads and installations continue to work. New releases generate
   organization URLs and image references. A repository redirect is not a GHCR
   image redirect.
4. Build new staging images with the updated staging workflow. Keep the new
   staging package private, grant the staging server read access, and deploy by
   the newly reported digest. Preserve access to the old private package until
   existing staging deployments have migrated.
5. Update production and staging deployment image references and registry
   credentials only after successful pulls from the destination. Repoint any
   deployment automation separately. Do not remove the old packages as part of
   the repository transfer.

## Pages and custom domain

1. Verify `littlehint.affoldercreative.com` for the organization in its Pages
   settings. Coordinate any existing personal-account verification rather than
   assuming verification moves with the repository.
2. In the transferred repository, confirm Pages uses GitHub Actions, the custom
   domain is still `littlehint.affoldercreative.com`, `PAGES_ENABLED=true`, and
   the `github-pages` environment permits `main`.
3. Change only the `littlehint` DNS CNAME target to
   `affolder-creative.github.io`. Preserve the custom-domain association in
   GitHub while making this change. The old default Pages URL is not redirected
   by a repository transfer.
4. Coordinate this change with the outstanding certificate setup. Cloudflare
   currently provides visitor HTTPS; turning its proxy off before GitHub has a
   valid certificate can interrupt HTTPS. Check GitHub's DNS/certificate status
   and enable GitHub HTTPS enforcement once eligible.
5. Deploy the marketing workflow and verify the custom-domain homepage, all
   assets, the sharing image, and organization source/setup/license links.
   Confirm HTTP redirects to HTTPS. Canonical and social URLs continue using
   `littlehint.affoldercreative.com`.

References: [GitHub repository transfers](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository),
[package permissions and repository transfers](https://docs.github.com/en/packages/learn-github-packages/about-permissions-for-github-packages#about-repository-transfers),
and [custom Pages domains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).
