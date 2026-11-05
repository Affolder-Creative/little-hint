# Surprise privacy implementation plan for 0.19.1

Prepared November 5, 2026 from the four reproduced findings in [PRIVACY_AUDIT.md](PRIVACY_AUDIT.md). Implementation follows this plan in three stacked fix PRs. Production data and deployment remain untouched. The user selected patch release 0.19.1 and retained the normal Release Please pipeline.

Use two implementation PRs and one release-readiness PR, followed by the normal generated release PR. Spending has one shared authorization problem behind F3 and F4. Exchange navigation and note audiences share a missing shopping context, so F1 and F2 belong together. Each implementation PR includes its own regression tests and documentation.

## Original starting point and constraints

- The audit checkout is `009a014`. Verified GitHub `main` is `165a027`, which adds account closure and guardian handoffs. Start implementation from the latest main and include those lifecycle paths in verification.
- The latest published release is [v0.18.0](https://github.com/Affolder-Creative/little-hint/releases/tag/v0.18.0). [PR #164](https://github.com/Affolder-Creative/little-hint/pull/164) currently proposes 0.19.0 for the account lifecycle work. Recheck both before preparing the release.
- This is a greenfield app with production data the owner wants to keep. Preserve records, IDs, notes, quantities, amounts, and dates. Do not reset the database, discard history, or build broad legacy compatibility machinery.
- Use corrected authorization for existing records wherever possible. Add data transformations only when the new model needs fields or an existing record would otherwise remain exposed.
- Preserve the approved recipient policy. A guardian or any controller of a joint recipient receives recipient privacy. Spending partnership and administrative roles do not override it.
- These fixes cannot retract information someone already saw. They must prevent subsequent disclosure and avoid sending historical activity again during repair.

## PR 1: enforce spending privacy consistently

Suggested title: `fix: enforce recipient and private-idea spending privacy`

Closes F3 and F4. Start here because it fixes direct surprise disclosures and supplies the spending protections needed by the exchange work.

### Server changes

1. Replace the `userId`-only recipient test in `src/server/spending.ts` with the same controller policy used by `src/server/domain-access.ts`. Evaluate both partners against all current and recorded recipients, including joint recipients. Avoid a second independently maintained definition of a recipient.
2. Centralize the decision about whether a spending record may be shared. Use it for reads, automatic sharing, explicit sharing, shared editing, history, exports, and aggregates. Filter records before computing totals, counts, payer summaries, or available filters.
3. Resolve the source reservation and item, including derived records through `sourceId`. A currently private idea, an exchange gift, or a recipient-controlled partner makes the record ineligible for partner sharing. A missing `keepPrivate` flag must never bypass this decision.
4. Preserve enough source identity and privacy information for purchases, refunds, and contributions to retain their restrictions if the source is deleted. Do not turn a source-linked record into an unrestricted manual record because a lookup failed. Standalone manual spending remains supported.
5. When an idea becomes Only me, revoke the affected sharing grants in the same transaction and preserve the payer's own records. Stop automatic rules from immediately restoring those grants. Making the idea visible again must not silently reshare old records; require a fresh sharing choice.
6. Re-evaluate recipient protection after guardian handoffs, profile connections, recipient edits, and account closure. Apply current authorization on every request even if a reconciliation step was missed. Reconciliation should also clear invalid grants so an old grant does not revive later.
7. Preserve legitimate financial history for the actual buyer or contributor. Removing access granted through a spending partnership must not delete another financial party's own records. Keep this distinction in deletion and account-closure handling.

### Client changes

- Return server-derived sharing and editing capabilities with the spending view. Replace the ledger's reliance on the stored `protected` flag.
- Make `SpendingPurchase.tsx` use authorized purchase/sharing options rather than its own incomplete guardian check. Explain restrictions to the payer without disclosing a protected record or its existence to the partner.
- After an Only me change, refresh affected item and spending queries. Check already-open partner sessions using the app's existing refresh behavior. The next request must omit the protected data; a stale mutation must fail. Previously delivered content cannot be recalled from an offline device.

### Files and verification

Primary files: `src/server/spending.ts`, `src/server/domain-access.ts`, item-update handling in `src/server/domain.ts`, `src/shared/spending.ts`, `src/client/Spending.tsx`, and `src/client/SpendingPurchase.tsx`. Review account closure and guardian handoffs on current main. Add a small shared policy module if needed to avoid worsening existing import cycles.

- Extend spending domain tests with guardians, multiple guardians, joint recipients, and accepted handoffs.
- Cover every record kind and sharing method, including a direct API purchase that omits `keepPrivate`, explicit sharing, edits, refunds, and contributions.
- Test shared idea -> Only me -> shared idea, source deletion, missing source links, connection changes, and account closure. Verify the payer retains history and partner grants do not revive.
- Compare complete unauthorized responses before and after hidden purchases. Assert that record lists, history, totals, counts, and export output reveal no new activity.
- Add PostgreSQL tests for privacy changes racing with purchase/share mutations, and a browser test using separate giver and guardian/partner sessions.

PR acceptance: all F3/F4 reproductions stop disclosing data through both ordinary UI actions and direct requests, while permitted shared spending still works.

## PR 2: preserve exchange context and persist note audiences

Suggested title: `fix: preserve exchange shopping and note privacy`

Closes F1 and F2. Build on PR 1 and keep the navigation, server validation, and note composer changes in the same PR so the displayed audience matches the saved audience.

### Explicit shopping context

1. Introduce one shared representation of an ordinary gift versus an exchange assignment. Exchange context includes the exchange, controlled giver, and assigned recipient. Validate the tuple on the server against current permissions and assignment state.
2. Carry it from the assignment link through person pages, list pages, gift cards, gift details, and purchase entry points. Preserve it through filters, pagination, refresh, back navigation, and opening an in-app link in another tab. Clear or revalidate it when switching accounts or browsing an unrelated recipient.
3. Use opaque identifiers for routing. Do not place names or note contents in URLs, pass assignment context to external retailer links, or treat a URL parameter as authorization.
4. Show the selected exchange and giver beside the reserve, purchase, and note actions. Shopping from an assignment starts with that assignment selected. Choosing an ordinary gift from there must be an explicit change.
5. On generic entry points, offer only server-authorized assignments. If several match, require a choice. Do not silently choose the first managed giver or infer an exchange solely because the recipient participates in one. Intentional ordinary gifts remain available.
6. Make the reservation and direct-item purchase commands use the same validation. Missing or stale context must not silently create an ordinary gift when a choice is needed. Existing-reservation purchases inherit the stored context. Reject forged IDs, mismatched recipients, and unavailable assignments without exposing their details.
7. Preserve exchange classification through purchase, release, history, and summaries. Continue to reject exchange contribution pools. Verify that `revealExchangeGivers: false` excludes these gifts from recipient summaries.

### Persistent note audience

1. Replace inference from an active reservation with an explicit audience stored on each new note. Support ordinary nonrecipient shoppers, the selected exchange giver and their managers, and author-only storage where needed for unresolved older notes.
2. Display the actual audience in the composer before posting. An exchange note remains scoped before reserving, while reserved, and after releasing the gift. Multiple managed givers get separate contexts.
3. Use one audience predicate for note projection, mention candidates, mention validation, edit authorization, watches, inbox entries, unread counts, and notification delivery. Current item access and recipient exclusion still apply, even to someone who controls the giver.
4. Keep the audience stable when editing text. A broader audience requires a separate deliberate change with the resulting audience shown. A reservation change must never widen it.
5. Define lifecycle behavior explicitly: released reservations do not change note scope; cancelled or archived exchanges never turn notes into ordinary discussion; former managers lose access; newly accepted managers follow the existing controller policy. If a required context is gone, restrict access instead of falling back to shared notes.
6. Keep external private-activity previews generic. Recheck queued notifications against the stored audience at delivery time. Repairing or classifying old records must not generate fresh mentions or replay old notifications.

### Files and verification

Primary files: `src/client/Exchanges.tsx`, browsing/detail routes in `src/client/App.tsx`, `src/client/components.tsx`, `src/client/SpendingPurchase.tsx`, `src/shared/model.ts`, `src/server/domain.ts`, `src/server/activity.ts`, `src/server/spending.ts`, and exchange validation helpers. Include the collection/detail API and mention picker call sites.

- Promote the audit's actual assignment-navigation reproduction into a maintained browser test at desktop and phone widths. Check the selected context and another shopper's response, not just the label on the giver's screen.
- Cover assignment -> person -> list -> gift, direct person/list/gift entry, Buying -> Record purchase, refresh, back, new tab, and multiple managed givers or exchanges.
- Test notes before reservation, after reservation, after release, and after an exchange is cancelled or archived. Repeat with mention search, forged mentions, edits, watches, inbox counts, and delayed delivery.
- Verify that other shoppers receive exchange anonymity without purchase progress or timestamps, recipients receive no hidden activity, and prohibited exchange pools remain unavailable.
- Include an ordinary gift and an ordinary shopper discussion as positive controls. Confirm that summary opt-in, whole-day reveal timing, and Transparent list behavior still work.
- Cover stale clients and retries. A failed request must not be retried automatically as an ordinary gift or a broader note. Idempotency responses must use current authorization.

PR acceptance: F1/F2 reproductions stop disclosing data, and every tested action saves the context/audience displayed before submission.

## Existing production data: preserve first, repair only where needed

Do not implement a blanket rewrite of old reservations or notes. Do not require users to reconfirm every historical record. Start with a read-only preflight against a restored production backup or another authorized copy. Report counts by issue and unresolved references without printing gift titles, note bodies, names, or credentials into general logs or CI artifacts.

| Existing data                                                             | Required handling                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spending with an available source                                         | Enforce corrected permissions immediately. Revoke only grants that violate the corrected policy. Preserve amounts, dates, ownership, and history.                                                                                                                                      |
| Derived spending or deleted sources                                       | Backfill source/privacy metadata where existing relationships establish it. Preserve known restrictions. If source-linked privacy cannot be established, keep the owner's record and withhold partner sharing pending review. Do not apply this to ordinary standalone manual records. |
| Correctly tagged exchange reservations                                    | Keep their IDs, quantities, purchases, and exchange classification. No historical repair needed.                                                                                                                                                                                       |
| Notes already carrying `giverId`                                          | Preserve that restricted audience. Do not invent an exchange association if the stored data does not establish one.                                                                                                                                                                    |
| Ordinary records with no indication of an exchange ambiguity              | Preserve their existing behavior. New writes use the explicit model.                                                                                                                                                                                                                   |
| Untagged reservations or unscoped notes plausibly created for an exchange | Identify candidates using retained assignments, reservations, author/buyer identity, recipients, and available dates. A match is a review candidate, not proof of intent. Do not automatically assign an exchange or widen an audience.                                                |

For the last category, review only actual candidates found in the preflight. If a candidate cannot be resolved before upgrade, preserve its contents and mark it for owner review. Withhold an unresolved note from other shoppers; preserve an unresolved reservation's anonymous availability while withholding giver attribution, purchase progress, partner sharing, and summary disclosure. Let the authorized owner confirm ordinary versus exchange intent, subject to current permissions. Do not force a reservation with contribution history into an exchange, which prohibits pools.

A preflight cannot prove original intent when that intent was never recorded, and missing historical assignments limit detection. Report that uncertainty rather than claiming every historical gift has been classified. If the deployment has no affected ambiguous data, omit the repair workflow entirely. A small targeted correction through existing commands is preferable to building a general remediation system for hypothetical data.

### Migration and compatibility requirements

- Keep model additions small. Existing explicit scopes and financial values must round-trip unchanged. Separate deterministic metadata backfills from owner decisions about ambiguous intent.
- If persisted authorization semantics change, increment the supported schema version so an older app or worker cannot read the new data using broader permissions. Current main already uses schema version 4; allocate subsequent versions from the actual implementation base.
- Make migrations transactional and idempotent under the existing database locks. Test fresh installation, upgrade from the current production schema, repeated startup, and rollback on a migration error. Do not assume the production version matches this checkout.
- Upgrade app and worker together. Include stale browser requests in compatibility tests; return a useful refresh/reselect error when their payload cannot express the required choice.
- Test a backup restore before rollout. If a data migration prevents running the older binary, document that rollback needs a matching database and uploads restore. Prefer a forward fix once new production writes exist, since restoring an old backup loses later writes and can restore closed accounts.

## Regression and CI requirements

Move the useful cases in `scripts/audit-surprise-privacy.ts` into ordinary regression tests. The diagnostic currently exits 1 when the vulnerabilities reproduce. After the fixes, either turn it into a clearly named passing verification command or remove it once the maintained tests cover every finding. Do not leave an intentionally failing audit script presented as a passing check.

Add a focused `tests/surprise-privacy.integration.test.ts` and `tests/surprise-privacy.spec.ts`, or extend equivalent existing suites. Ensure CI actually invokes them:

- `test:integration` currently lists files explicitly. Add any new integration file to that script.
- `scripts/ci-browser.mjs` explicitly selects spec files. Add the browser spec to an existing suitable suite, or register a new suite in both the launcher and workflow matrix. Do not rely on Playwright's default discovery inside these jobs.
- Review `scripts/ci-policy.mjs` and its tests if new paths or suites change CI selection.
- Run typecheck, build, unit/domain tests, real PostgreSQL integration tests, and the relevant browser suites for each PR. Run the full required CI on the combined release commit. Skipped database tests are not evidence of success.

The acceptance matrix must include the giver, another shopper, direct recipient, guardian, joint-recipient controller, spending partner, giver manager, former manager, and administrator. Cross those roles with the changed flows, rather than testing only the happy path as the record owner.

Keep existing passing boundaries intact: recipient DTOs and counts, list privacy locks, reveal dates/timezones, account exports, generic notification previews, API cache policy, service-worker account separation, deletion, and retained financial history. Check browser responses as well as rendered content. Include phone-width keyboard and focus behavior for new context/audience controls.

Use synthetic fixtures for ordinary tests. Production backups must not enter the repository, screenshots, test traces, or CI artifacts.

## Release preparation and rollout

0.19.1 is the agreed patch target because these changes fix promised privacy behavior. Version 0.19.0 has shipped. Keep implementation PR titles truthful as fixes; do not label fixes as features solely to influence Release Please.

1. Finish both implementation PRs and their tests. Update the product/architecture documentation with the resulting audience and sharing rules, and annotate the audit findings with their fix commits and verification evidence.
2. Version 0.19.0 has shipped. Merge the three fix PRs before merging the generated 0.19.1 release PR. The third fix PR prepares release readiness; Release Please owns the final version bump and tag.
3. Follow [RELEASING.md](RELEASING.md) for an explicit version correction if Release Please proposes a patch. Keep `.release-please-manifest.json`, `package.json`, both package-lock version fields, the changelog heading/comparison, and the release PR title/body consistent. Recheck after the bot's final update.
4. Before release merge, require all four findings to pass, the historical-data preflight/migration behavior to be verified on representative data, and the combined workflow checks to pass. Document any deployment-specific review candidates and resolve or restrict them before reopening that deployment.
5. Review the actual changed workflows together on desktop and phone widths. Check that context, audience copy, validation, loading, and errors describe the server's behavior. Include account switching and the new guardian handoff paths from 0.19.0.
6. Merge the release PR only when ready. Verify the tag and version refer to the selected commit. Let the existing pipeline run full CI on that exact tagged commit, build/test both AMD64 and ARM64 app/worker images, scan them, and produce the required SBOMs, provenance, source bundles, and release assets. Failed candidates remain drafts.
7. Publish through the existing release workflow. Publication does not deploy the app. For deployment, rehearse the upgrade and data-preservation checks in staging, then deploy the tested digest to production with app and worker together and a verified backup available.
8. Smoke-test the four fixed scenarios with synthetic accounts after deployment. Check restricted partner views and notifications without emitting real surprise details. Record the deployed digest and migration version.

Release notes should explain the corrected exchange context and note audiences, guardian protections in Spending, and the effect of Only me on partner sharing. Mention any actual review or refresh required for existing data. Do not imply that users need a data reset or that previously viewed information can be withdrawn.

## Completion criteria

- F1 through F4 have maintained regression tests that pass against the release commit.
- New actions save the context and audience shown to the user; direct requests cannot bypass them.
- Existing production records survive the tested upgrade. Any restrictions or targeted repairs are explained and limited to affected data.
- No unauthorized details, counts, totals, history, exports, or queued notifications emerge through the changed flows.
- The 0.19.1 release metadata, tagged source, published images, and deployment instructions agree.

Implementation status and current merge instructions are recorded in [release readiness](PRIVACY_RELEASE_0.19.1.md). Production access and publication remain outside this implementation task.
