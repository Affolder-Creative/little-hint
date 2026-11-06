# Automated release acceptance

Use these checks to collect evidence for the [candidate worksheet](V1_ACCEPTANCE.md).
They reduce manual work; they do not certify every installation gate.

## Run the full candidate CI

Select a full source SHA. Dispatch the **CI** workflow on that revision and record
the run URL and tested SHA. Manual CI runs every job, including database integration,
all browser suites, AMD64/ARM64 containers, and the isolated
[upgrade and recovery drill](UPGRADE_VERIFICATION.md).

For staging, dispatch **Staging image** from `main` with that full SHA as its `ref`
input. The workflow's own branch is not necessarily the source it builds. Use the
resolved commit and image digest in the job summary. Before deploying, compare the
image's `org.opencontainers.image.revision` label with the selected SHA. Verify the
running app and worker afterward. A successful build does not deploy Coolify.

## Run the browser acceptance command

From a checkout with Node 24 or newer:

```sh
npm ci
npx playwright install chromium firefox webkit
npm run test:acceptance:ui
```

On Linux, install the browser system dependencies too, using Playwright's
`install --with-deps` option. The command builds the production frontend, starts
a temporary loopback server, and runs the existing account lifecycle, settings,
and interface regression suites in Chromium, Firefox, and WebKit. All API responses
are synthetic fixtures. It requires no database, provider credentials, or deployed
account. The development API proxy is disabled.

Each run saves an ignored `.local/acceptance/<timestamp>/` directory containing:

- `evidence.json`: source SHA, working-tree changes, browser versions, timestamps,
  totals, and pass/fail result.
- `results.json` and `html/`: individual test results and a browsable report.
- `artifacts/`: screenshots and failure traces produced by the tests.

The command exits unsuccessfully for failed, skipped, flaky, empty, or incomplete
runs. Missing browser installations and build failures also leave failed evidence.
A dirty checkout is recorded explicitly; commit the changes before collecting final
candidate evidence. Keep raw reports private and publish only sanitized summaries.

This covers simulated narrow/short viewports, enlarged text, both themes,
keyboard/focus behavior, automated accessibility rules, export downloads, email
change errors, and closure safeguards. Browser engines do not certify branded
Chrome/Edge/Safari releases, physical keyboards or touch keyboards, installed apps,
screen-reader announcements, real email delivery, or backend privacy by themselves.
The separate full CI supplies backend and workflow regression coverage.

## Keep the remaining hands-on work small

Record the exact OS/browser/device, revision, date, result, and any failure in the
private worksheet. These sessions supplement the full matrix; an unavailable
required device remains Pending.

1. **Phone or tablet:** on staging with a synthetic account, sign in and follow an
   authorized list link. Install where supported, close and relaunch, rotate, and
   open the email-change form with its keyboard visible. Confirm labels, fields,
   and actions remain reachable. Cancel the change. Opt into a personal draft,
   disconnect, relaunch, reconnect, and confirm the draft survives. Repeat on the
   supported iPhone, iPad, and Android devices that are available.
2. **Keyboard and screen reader:** use Tab, Shift+Tab, Enter, and Escape without a
   mouse. Open and cancel email change and account closure. Check that the reader
   announces the dialog title, field labels, validation errors, and closure warning;
   focus returns to the opener. Repeat at 200% zoom and in the other theme. Review
   closure without completing deletion of a real account.
3. **Real delivery:** use authorized disposable accounts and inboxes for invitation,
   sign-in, both email-change codes, and the closure code. Confirm arrival and
   recovery after an incorrect code. Mailpit proves the app-to-test-mail path, not
   real inbox delivery. Test enabled SMS, Telegram, and push separately; mark
   disabled providers Not applicable with a reason.

The retailer, gift coordination, event repetition, and update cases in the full
worksheet still need installation evidence where fixture tests cannot establish
it. Use separate synthetic buyers and recipients; do not test surprise disclosure
against real gifts.

## Operations evidence

Record the start of the 24-hour observation only after the intended image is
running. Check app/worker health, heartbeats, restarts, errors, retries, scheduled
work, and uploads at the start and end, with monitoring during the interval.
An HTTP health response alone does not identify the deployed commit or prove worker
health. A changed deployment requires a new observation record.

The CI recovery drill uses generated data and disposable storage. A fresh staging
dump restored locally is useful additional evidence, but neither establishes that
the installation's actual off-host backup, recovery secrets, failure alerts, or
stale-backup detection work. Keep that gate Pending until the actual repository's
snapshot has been restored into isolated storage and checked using
[the recovery procedure](OPERATIONS.md#restore-procedure). Do not restore into live
volumes for an acceptance drill.
