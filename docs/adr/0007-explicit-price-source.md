# Keep the displayed price source explicit

An item or product uses shop prices or a custom price, including an optional range. This avoids duplicate entry and first-keystroke copying while retaining the separation between shopping offers and price ranges established in ADRs 0005 and 0006. Shop pricing prefers the lowest fresh verified offer, falling back to the lowest saved amount; custom pricing never overwrites a shop and pauses automatic checks.

Migration preserves existing amounts. Matching exact prices become shop-sourced; conflicting prices, ranges and unknowns remain custom because old records cannot distinguish intentional entries from mistakes. Schema 16 requires app and worker upgrades together. Actual spending and saved reservation estimates remain independent.

## Linked shared costs

A buyer may explicitly link a shared-cost goal to complete recorded purchase costs. New cost-sharing setups after a fully recorded purchase default to this link. Buyer-owned purchases minus shop refunds determine the total; the saved goal from others stays fixed and the buyer's share absorbs corrections. Manual totals remain independent. Incomplete costs wait, and conflicting refunds require review. Schema 19 protects this behavior from older runtimes. See issue #297.
