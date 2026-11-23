# Keep the displayed price source explicit

An item or product uses shop prices or a custom price, including an optional range. This avoids duplicate entry and first-keystroke copying while retaining the separation between shopping offers and price ranges established in ADRs 0005 and 0006. Shop pricing prefers the lowest fresh verified offer, falling back to the lowest saved amount; custom pricing never overwrites a shop and pauses automatic checks.

Migration preserves existing amounts. Matching exact prices become shop-sourced; conflicting prices, ranges and unknowns remain custom because old records cannot distinguish intentional entries from mistakes. Schema 16 requires app and worker upgrades together. Actual spending and saved reservation estimates remain independent.
