# Record item archive time separately from list order

Archived-item browsing defaults to newest archive time first and supports other automatic sorts. Record archive time independently of creation time and retain the item's manual list position for restoration. Restoring an item and archiving it again starts a new archive time; ordinary edits do not. Whole-list and event archiving retain their existing ordering and do not count as individual archive actions.

Existing archived items have no recoverable archive time. Keep that history unknown and place these items after timestamped archives in their existing default relative order for both newest-first and oldest-first archive-date sorting. For priority, name, or price sorting, include them normally according to the selected attribute. Assigning creation or rollout dates would invent a chronology that the stored records cannot support.

The original fixed-order behavior was tracked in [issue #216](https://github.com/Affolder-Creative/little-hint/issues/216). [Issue #222](https://github.com/Affolder-Creative/little-hint/issues/222) revises browsing to support automatic sort choices remembered separately from Active, while preserving this archive-time model.
