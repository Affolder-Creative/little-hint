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

Repository visibility remains private. GitHub Pages for a private repository requires a plan that supports it; otherwise make the repository public separately or change the plan. Do not change visibility merely to run this workflow. A public Pages site does not grant visitors access to a private repository. The landing page currently explains that source and setup links require access; remove that note when the repository becomes public.

1. In the repository's **Settings → Pages → Build and deployment**, choose **GitHub Actions** as the source when ready to publish.
2. Ensure the `github-pages` environment permits deployments from `main`.
3. Merge `marketing/github-pages` into `main`.
4. Run **Marketing site** from the Actions tab on `main`, or push a marketing change to `main`. Pull requests validate assets and links but never deploy.
5. Confirm the deployment succeeds and visit `https://kaffolder7.github.io/little-hint/`. In the repository's About settings, use that URL for **Website**.

Only `marketing/` is uploaded. The workflow cannot publish server code, secrets, documentation, or the design concepts outside that directory. No app service worker or PWA manifest is registered on the marketing site.

The HTML's canonical URL, Open Graph URL/image, and GitHub links assume `kaffolder7/little-hint` and its `main` branch. Update them if the repository moves or a custom domain is added. Local assets and anchors are relative and work under the project subpath.

See [GitHub's custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
