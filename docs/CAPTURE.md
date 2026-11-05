# Capture products from shopping apps

Open **My lists → Capture a product** to paste a product link or a shopping
app's shared message. Choose a wish list or a private gift idea for another
person, then review the item before saving. Existing import drafts, manual
entry, and duplicate warnings remain available. Clipboard access happens only
when you press **Paste link**; ordinary paste works when access is denied.

Installed PWAs can receive title, text, and URL shares at `/capture` on browsers
that support Web Share Target. Safari on iPhone/iPad does not support receiving
PWA shares; copy the product link and use the capture screen instead. Existing
installations may need their browser to refresh the manifest before the share
menu includes Little Hint. A share source must provide a web link; image-only
shares are not supported.

Opening a shared URL does not save an item or start a lookup. The user must
choose Review. The existing importer retains its server-side URL/network
validation and destination authorization. Shared parameters remain in the URL
through sign-in, reloads, and connection retries. Saving the item or choosing
Clear removes them from the current URL. They can appear in browser history;
do not share a capture URL containing a surprise with its recipient.

## Validation

Unit tests cover URL extraction, ambiguous input, credentials, oversized input,
and manifest registration. Browser tests in the PWA CI suite exercise capture
at mobile and desktop sizes, sign-in/reload recovery, failed imports, manual
entry, denied clipboard access, duplicate confirmation, double submission, and
private gift ideas without an owned list.

Before release, verify receiving a real shopping-app share on an installed
Android PWA, including text-only URL payloads and manifest refresh. Verify the
copy/paste flow on a physical iPhone. Desktop automation does not certify OS
share-menu registration or real retailer extraction.
