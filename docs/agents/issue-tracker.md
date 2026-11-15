# Issue tracker: GitHub

Issues and specs live in https://github.com/Affolder-Creative/little-hint.
Use the `gh` CLI from this repository.

## Ticket operations

- Create: `gh issue create --title "..." --body-file <file>`.
- Read: `gh issue view <number> --json number,title,body,labels,comments`.
- List: `gh issue list --state open --json number,title,body,labels`.
  Add label filters as needed.
- Comment: `gh issue comment <number> --body-file <file>`.
- Label: `gh issue edit <number> --add-label "..."` or
  `--remove-label "..."`.
- Close: post the explanation as a comment, then run
  `gh issue close <number>`. Comment separately even if already closed.

For multiline bodies, write the text to a temporary file and use
`--body-file`.

Before creating the first issue of a session, verify the target with
`gh repo view --json nameWithOwner`. It must be
`Affolder-Creative/little-hint`; pass `--repo` explicitly if needed.

When a skill says "publish to the issue tracker", create a GitHub issue.
When it says "fetch the relevant ticket", read the GitHub issue.

## Parent issues and blockers

Use GitHub's native sub-issues and issue dependencies when available.
For CLI syntax, consult the installed `gh issue create --help` and
`gh issue edit --help`.

If sub-issues are unavailable, put `Part of #<parent>` at the top of
the child body and link the child in the parent's task list.

If native dependencies are unavailable, put `Blocked by: #<number>`
at the top of the blocked issue. An issue is unblocked when every
blocker is closed.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Wayfinding operations

A wayfinder map is an issue labelled `wayfinder:map`, with Notes,
Decisions-so-far, and Fog sections. Link its tickets as sub-issues,
or use the parent/task-list fallback above.

Use `wayfinder:<type>` labels for research, prototype, grilling,
and task tickets. Select the first open ticket in map order with
no open blockers and no assignee.

Claim with `gh issue edit <number> --add-assignee @me`.
Resolve by commenting with the answer, closing the ticket, and
adding a summary and link to the map's Decisions-so-far section.
