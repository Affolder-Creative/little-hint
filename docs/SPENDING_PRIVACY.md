# Spending privacy

Spending partnerships do not override recipient privacy. A partner controlling any recipient profile, including a guardian or joint recipient, cannot see or edit the other partner's source-linked gift records. The same policy filters history and totals.

Changing an idea to Only me revokes partner sharing for its plans, purchases, refunds, and contributions. The payer retains their own history. Making the idea shared again does not restore old sharing grants. An eligible record can be shared again explicitly.

Source-linked records with missing sources remain private to their owners. Standalone manual purchases continue to follow ordinary spending rules. No financial records or notes are deleted by this upgrade.

Schema version 5 prevents older app/worker versions from interpreting the new privacy state. Upgrade both together. Back up the database and uploads before upgrading; rollback to an older binary requires a matching restore. Existing records are checked under the corrected policy immediately, and invalid sharing grants are reconciled transactionally.
