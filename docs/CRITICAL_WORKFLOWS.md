# Critical workflow regression coverage

The 1.0 stabilization pass extends the existing suites at feature boundaries.
It does not mark physical-device, provider, or production recovery checks done.
See [release readiness](V1_READINESS.md) for those gates.

## Added coverage

- `tests/critical-workflows.test.ts` follows accepted guardian handoffs through
  spending access, gift views, JSON export, and all CSV tables. It repeats the
  checks after closing the former guardian's account. The child keeps their
  wish list, the new guardian cannot export another buyer's receipt or amounts,
  and the buyer retains their own financial record.
- The same suite follows a failed captured draft through archiving its original
  annual event and repeating that event. Saving to the archived destination
  fails without consuming the draft. With lookups disabled, the user can retarget
  and manually save it to the new list. Stale revisions fail, a repeated save
  creates one item, and the old event's purchases remain unchanged.
- `tests/account-email.integration.test.ts` checks that both old devices lose
  JSON and CSV export access after a verified email change. A fresh sign-in
  exports the updated email under the same account and profile identities.
- `tests/account-closure.integration.test.ts` checks that both devices also lose
  JSON and CSV export access after the closure transaction commits.

The new domain transitions pass without application changes. They exercise
real domain commands and export functions, not mocked privacy decisions.
The account tests use actual authentication routes and isolated PostgreSQL;
email delivery is controlled.

## CI selection correction

Previously only three explicitly named database test files selected the
integration job. A PR changing only account email/closure, friend, pagination,
SMS, or surprise-privacy integration tests could run the quality job while the
database tests skipped there for lack of a configured database.

All `tests/**/*.integration.test.ts` paths now select integration checks, as
well as the original `tests/integration.test.ts`. The selector regression
iterates every integration-test file currently in the top-level tests directory.
All eight suffixed files must select the job; six failed before the correction.
The workflow still runs its separate main, SMS, staging and preview database
commands. This change does not weaken the final CI gate or remove any suite.

## Existing coverage retained

| Workflow                                                                                    | Maintained suites                                                                            |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Recipient, guardian, joint-owner, removed-member and spending-partner privacy               | domain, group-events, spending-privacy, exchange-privacy, surprise-privacy                   |
| Concurrent final-unit buying, exchange draws, access changes and retries                    | integration, surprise-privacy.integration                                                    |
| Capture through sign-in, import failure, duplicates and manual fallback                     | capture.spec, import-replays, manual-lookups, lookup-reliability                             |
| Annual repetition, participant eligibility and fresh lists without inherited activity       | group-events, repeat-event.spec, integration                                                 |
| Export allowlists and spreadsheet safety                                                    | account-export, account-csv, account-export.spec                                             |
| Email verification, collisions, session revocation and invitation-only admission            | account-email.integration, account-email.spec                                                |
| Closure confirmation, accepted handoffs, commitments, rollback, concurrency and late writes | account-closure, account-closure.integration, account-closure.spec, media                    |
| Disabled services, provider outages, retries and operation without AI                       | channel-availability, ai-enabled, notifications, imports, gift-discovery-worker, reliability |

## Validation

Run `npm test` for domain and privacy checks, and `npm run test:tooling` for
selection and CI gate regressions. Database skips in the ordinary unit run are
expected; they are not evidence that integration passed. Run
`TEST_DATABASE_URL=... npm run test:integration` against a disposable
`little_hint_test` database. These tests clear data.

Review full CI on the exact PR head, including the eleven browser suites and
both container architectures. Keep the final 1.0 candidate acceptance record
separate from this regression-coverage inventory.
