---
version: 1
slug: "src-client-settingsnavigation-tsx"
primary_target: "src/client/SettingsNavigation.tsx"
related_targets: ["src/client/App.tsx", "src/client/Households.tsx"]
---

# Settings

- Mode: Operate. Reach a personal preference or one family group's management controls without traversing other groups.
- Preserve Little Hint's warm theme tokens, system type, flat divided rows, native fields and existing modal forms.
- Desktop uses a local section navigation rail. Below 1100px, a labeled native selector replaces it. Show one section at a time; keep hidden forms mounted to preserve unfinished edits while navigating.
- Sections: Profile & appearance, Family groups, Notifications, Device & drafts, Sign-in & security, and authorized Administration. Sign-out remains accessible from every section. Pending family-group requests have a visible shortcut.
- URLs retain section, selected group ID, and Members/Households/Events view for refresh, bookmarking and browser history. Unknown or unauthorized categories fall back to Profile; absent groups fall back to an available group or an empty state.
- Family groups use an ID-based selector with owner and short-ID context for duplicate names. Members is the default view; household configuration stays optional. Compact person membership summaries retain short IDs for duplicate household names, while choosers show full member context.
- No authorization, matching, photo handling, invitation, or persistence semantics change. Security-session identification and integration-service grouping remain separate follow-up work.
