---
version: 1
slug: "src-client-settingsnavigation-tsx"
primary_target: "src/client/SettingsNavigation.tsx"
related_targets:
  [
    "src/client/App.tsx",
    "src/client/SettingsPage.tsx",
    "src/client/Households.tsx",
    "src/client/AccountInvitations.tsx",
    "src/client/InvitationShare.tsx",
    "src/client/AdminUsage.tsx",
  ]
---

# Settings

- Mode: Operate. Reach a personal preference or one family group's management controls without traversing other groups.
- Preserve Little Hint's warm theme tokens, system type, flat divided rows, native fields and existing modal forms.
- Desktop uses a local section navigation rail. Below 1100px, a labeled native selector replaces it. Show one section at a time; keep hidden forms mounted to preserve unfinished edits while navigating.
- Sections: Profile & appearance, Invitations, Family groups, Notifications, Device & drafts, Sign-in & security, authorized Administration, and About. About contains the approved logo, tagline, version, and Affolder Creative credit. Sign-out remains accessible from every section. Pending family-group requests have a visible shortcut.
- URLs retain section, selected group ID, and Members/Households/Events view for refresh, bookmarking and browser history. Unknown or unauthorized categories fall back to Profile; absent groups fall back to an available group or an empty state.
- Family groups use an ID-based selector with owner and short-ID context for duplicate names. Members is the default view; household configuration stays optional. Compact person membership summaries retain short IDs for duplicate household names, while choosers show full member context.
- Invitations gives any signed-in user an email invitation action and their own pending account invitations with expiration dates and cancellation. Account invitations do not share profiles or lists; group invitations stay under Family groups and alone contribute to pending group-request counts.
- After creating an account or family-group invitation, keep the dialog open with confirmation that delivery is pending, the invited email address, a sign-in-link action, and Done. Pending invitation rows also offer the link action. Use native sharing where available and Copy sign-in link otherwise; expose a selectable read-only link if sharing or copying fails. Explain that the recipient must use the invited address. Cancelling the native share sheet is not an error. Invitation sharing uses the existing outlined button and field styles, a 12px stack gap, and wrapping actions.
- Household matching, photo handling, and family-group invitation acceptance stay unchanged. Solo Home makes a private wish list the primary action and group creation secondary.

- Profile & appearance and owned/managed person pages include a quiet underlined Gift preferences text action opening that tab in Edit profile. In Settings it sits below account details, while the outlined Edit profile button remains the main action. The two tab drafts and independent saves remain intact.
- Follow is separate from the group navigation, with a 32px horizontal gap and wrapping on narrow screens. Family-group creation is controlled by an app-wide administrator preference with an optional locking environment override; restricted users see invitation/administrator guidance.
- About adds Kyle's approved short family-origin story and an SVG signature traced from Kyle’s selected screenshot with a matching dash before the existing attribution and version.

Administration contains App settings, This month's usage, Service status, and Background jobs. Family-group creation, automatic product photos, device photo caching, and photo prefetching are editable, with optional locking ENV overrides. All service credentials, providers, models, limits, and AI availability are deployment-only. Service status reports configuration presence, not verified connectivity. Preserve usage after disabling services, notification retries, failed shop lookups, and the note that backup status is unavailable.

- Administration panels use a subtle warm beige (`#faeee5`) slightly darker than the page in light mode and retain the paper background in dark mode. Administration spacing follows the shared 8px related-content and 16px controls steps. Separate app preferences with a divider and 24px on either side. Service/job rows use top dividers and 16px padding, with no trailing rule or last-row bottom padding. Status aligns at the top and stacks below its description at 360px and narrower. Usage groups retain 44px disclosures with 16px top and 8px bottom padding.

- Deployment-unavailable SMS and Telegram are omitted from delivery setup, topic counters and controls, preview privacy, and follow choices/summaries. Available but unconnected channels retain setup actions. Hidden choices persist across saves and configuration changes. Remaining controls use the existing wrapping rows, with no empty placeholders or dividers.
- Service status retains Off and incomplete-configuration explanations for administrators. Monthly usage appears for available services or current-month provider submissions/requests, retaining disabled usage as Currently off. Prior-month and skipped-only SMS history do not keep sections visible; hide the panel when no groups qualify.

Product photo loading preserves the image area and contains the product. Visible thumbnails load promptly; detail photos retain the thumbnail until the larger image decodes. Administration has separate default-on caching and prefetching preferences with hosting overrides. Disabling caching suspends prefetching while retaining its saved preference.

Administration groups all photo preferences under one save action, separate from family-group creation. Each form preserves its own draft through query refreshes and section changes. Preloading appears unchecked and disabled while caching is off, with an explanation that its previous choice will return. Save applies changes; Discard changes restores only that form.

Failed jobs are collapsed by category with counts, ten newest rows and Show 10 more. Each row labels its creation timestamp Queued and separates diagnostics. Phone management separates saving consent from replacement/removal, with inline removal confirmation. Manual product entry disables automatic shop-photo controls without clearing their preference.
