# Marketing website

The standalone static site is in `marketing/`. GitHub Pages publishes only that directory. It needs no application server, database, npm installation, or build step. The application deployment is unchanged.

## Preview and check

```sh
npm run marketing:preview
# Open http://127.0.0.1:4174/little-hint/
npm run marketing:check
npm run marketing:test
```

Preview and static checks need Node.js 24+. Browser checks also need `npm ci` and Chrome, or a Playwright Chromium installation. Set `CHROME_PATH` if Chrome is installed elsewhere. Checks cover the project subpath, responsive layouts, assets, anchor navigation, keyboard entry, accessibility, and operation without JavaScript. Visual captures land in ignored `test-results/marketing/`.

## Screenshot provenance

```sh
npm ci
npm run marketing:capture
```

The capture script launches the unmodified React app through Vite and renders it in Playwright. It creates isolated `example.test` records through the application's domain commands, then serves the actual `world()` projection to the browser. It never connects to a database or live account. Recipient privacy and single-viewer exchange assignments are asserted before capture. No UI text, CSS, or DOM is replaced for screenshots. The app's own missing-photo illustrations are intentional: the demo gifts have no product photographs.

The checked-in WebP images include the Home screen on desktop and mobile, and responsive detail captures of Buying and Exchanges. Recapture after material app UI changes, then review all images and update HTML width/height attributes if dimensions change. The generated concept-board images in `design/marketing-concepts/` are not published.

`assets/social-preview.png` is a separate 1200 by 630 share image built from the site's actual typography and approved logo. Regenerate it with `npm run marketing:social`. Branding assets are copied from `public/brand/little-hint/`; the local Fraunces font and its OFL license come from the approved brand package.

## Enable GitHub Pages when ready

The public address is `https://littlehint.affoldercreative.com/`. The page describes personal self-hosting, infrastructure costs, the source-available license, and early-release support. Its source and setup links require the application repository to be public for visitors without access. GitHub Pages for a private repository requires a plan that supports it; a public Pages site alone does not expose a private repository.

The workflow always validates the site. Deployment stays disabled until the `PAGES_ENABLED` repository variable is `true`, so merges do not fail while Pages is unavailable or the site is not ready to publish. Runs on `main` explain the skipped deployment in their summary.

1. In the repository's **Settings → Pages → Build and deployment**, choose **GitHub Actions** as the source when ready to publish.
2. Ensure the `github-pages` environment permits deployments from `main`.
3. In **Settings → Secrets and variables → Actions → Variables**, set the repository variable `PAGES_ENABLED` to `true`. Only enable it after completing the Pages setup.
4. Run **Marketing site** from the Actions tab on `main`, or push a marketing change to `main`. Pull requests validate assets and links but never deploy.
5. Set the Pages custom domain to `littlehint.affoldercreative.com`. Verify domain ownership in GitHub, configure the DNS CNAME `littlehint` to `kaffolder7.github.io`, and enforce HTTPS when the certificate is ready. This Actions-based workflow does not require a repository `CNAME` file.
6. Confirm the deployment succeeds and visit `https://littlehint.affoldercreative.com/`. In the repository's About settings, use that URL for **Website**. Check the homepage, share image, and source/setup links without signing in to GitHub.

Only `marketing/` is uploaded. The workflow cannot publish server code, secrets, documentation, or the design concepts outside that directory. No app service worker or PWA manifest is registered on the marketing site.

The HTML's canonical URL and Open Graph URL/image use `https://littlehint.affoldercreative.com/`. GitHub links use `kaffolder7/little-hint` and its `main` branch. Update these if the domain or repository moves. Local assets and anchors are relative and work under the project subpath.

See [GitHub's custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
