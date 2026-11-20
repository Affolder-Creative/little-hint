# Separate administration from content access

An installation supports multiple app admins and each family group supports multiple family admins alongside its primary owner. Administration grants maintenance authority over already accessible content; it does not grant membership, recipient identity, profile control, co-management consent, or access to private content. This preserves the audience and surprise guarantees of ADRs 0002 and 0003 while allowing shared gifts to be maintained by someone other than their author.

Family authority applies when any administered group shares the record, so edits affect every audience of that record. App admins may manage group membership across the installation through an administrative directory, without entering those groups' content. Only app admins gain additional permanent-deletion authority, and deletion retains financial history and recoverable private drafts. Role changes use the domain transaction lock to preserve at least one app admin; primary ownership continues to transfer only by acceptance.

The specification is tracked in [issue #262](https://github.com/Affolder-Creative/little-hint/issues/262). Schema 13 initializes additional family admins without promoting event leaders; app and worker must upgrade together.
