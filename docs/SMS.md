# SMS setup

Little Hint supports Textbelt and Twilio. Choose one provider per installation. SMS is optional, US-only, and off by default. Email invitations still create accounts; verified phone numbers can sign in to existing accounts after the user separately enables SMS sign-in. Email and passkeys remain available.

## Textbelt account registration

Use **Little Hint** as the sender name on both the staging and production Textbelt accounts. Replace any automatically suggested domain name with this name. It matches the app's `Little Hint:` message prefix and per-message `sender` value. Separate accounts/API keys and balances distinguish the environments. The sender name identifies the app; it does not change the sending phone number. See [Textbelt's sender identification guidance](https://docs.textbelt.com/compliance).

For Textbelt's **“Describe how SMS recipients have opted into your service”** field, use the appropriate opening paragraph below, followed by the shared explanation. These examples describe a rollout that has not yet enabled SMS. Update the tense after deployment and describe only consent actually collected; buying credits or receiving an invitation does not establish SMS consent.

Staging opening paragraph:

> This account will be used to test SMS for Little Hint, a private, invitation-only app for family wish lists and gift coordination. SMS integration is being prepared; recipients will explicitly opt in before receiving messages.

Production opening paragraph, while the installation remains private:

> This account will support Little Hint's production environment, a private, invitation-only app used by family and friends for wish lists and gift coordination. It is not currently a publicly offered commercial service. SMS integration is being prepared; recipients will explicitly opt in before receiving messages.

Append this explanation to either opening paragraph:

> Invited users will sign in, enter their own US mobile number, and check an initially unchecked consent box to request a verification text. Verifying the number will not automatically enable recurring notifications or SMS sign-in. Each requires a separate affirmative choice in Settings.
>
> Recurring notifications will cover only selected app updates, with a default maximum of two activity texts per recipient per day. Requested verification and sign-in codes are separate. Consent disclosures explain that SMS is optional, message and data rates may apply, and recipients can reply STOP or disable notifications in Settings. Consent records will retain the account, phone number, timestamp, purpose, and disclosure text/version.
>
> Messages will identify Little Hint. Recurring messages will include “Reply STOP to opt out.” We will not send advertising, giveaways, payment notifications, or URLs.

If the configured daily activity limit differs from two, adjust the explanation to match. The form accepts an explanation or an opt-in form link; the explanation above describes the signed-in Settings flow without requiring a public enrollment page. These descriptions document the intended use and do not imply provider approval. Keep them aligned with the deployed behavior and [Textbelt's terms](https://textbelt.com/tos/).

## Production with Textbelt

1. Create a paid key at [Textbelt](https://textbelt.com/). Use a dedicated key for this installation. Other applications spending the same balance would make Little Hint's local credit reservations unreliable.
2. Set these server variables in your deployment platform or ignored environment file:

   ```dotenv
   SMS_PROVIDER=textbelt
   TEXTBELT_API_KEY=your-dedicated-key
   SMS_ALLOWED_EVENTS=exchange,access
   SMS_MONTHLY_LIMIT=100
   SMS_USER_DAILY_LIMIT=2
   SMS_CREDIT_RESERVE=20
   PAID_DAILY_LIMIT=50
   ```

   `PAID_DAILY_LIMIT` is the existing per-service daily request limit. For SMS, it counts submission attempts, including sign-in and phone verification. Checking a code, checking delivery status and checking quota do not consume this limit. The activity limits count conservatively reserved segments across all providers, using UTC months and days. Zero disables the corresponding allowance.

3. Deploy app and worker together with the same settings. Set `APP_URL` to the public HTTPS origin. The app supplies `https://your-origin/api/hooks/textbelt` as the reply webhook when sending activity messages. Keep this route publicly reachable without an interactive login or proxy challenge. It validates the Textbelt timestamp and signature against the exact request body.
4. In Settings → Notifications, choose **Manage phone & SMS sign-in**. Confirm the code sent to your account email. Link a real US mobile number and verify the SMS code. Your previous phone stays linked until its replacement is verified.
5. Choose SMS sign-in if wanted. This is an unchecked, separate choice. In Notifications, separately enable **Text messages**, read the consent text, choose eligible topics, and save. Verifying a number alone enables neither service.
6. In Settings → Administration, check **This month's usage → SMS**. Confirm the provider, balance, code reserve and activity budget. Balance checks happen on the server at most once per minute. A refresh button does not bypass that throttle.

The administrator selects eligible topics through `SMS_ALLOWED_EVENTS`. Supported values are `exchange`, `access`, `reservation`, `purchase`, and `discussion`. The defaults are exchange updates and actual loss of access affecting existing plans. Ordinary item edits do not count as access loss. Adding an allowed topic never subscribes existing users to it. Raising the per-user daily limit does not exceed the frequency a user last accepted until they save the new disclosure. Contributions/payment updates, invitations, mentions, wish-list summaries and promotions are excluded. SMS never includes gift titles, names, notes, links, or user-provided content.

The fixed activity message is:

> Little Hint: You have an update. Open the app to view it. Reply STOP to opt out.

## Staging with real SMS

Staging supports real SMS through explicitly prefixed variables. Production keys and unprefixed provider variables are ignored in staging. Preview deployments always disable SMS, including prefixed credentials.

```dotenv
STAGING_SMS_PROVIDER=textbelt
STAGING_TEXTBELT_API_KEY=your-separate-staging-key
STAGING_SMS_ALLOWED_EVENTS=exchange,access
STAGING_SMS_MONTHLY_LIMIT=100
STAGING_SMS_USER_DAILY_LIMIT=2
STAGING_SMS_CREDIT_RESERVE=20
STAGING_PAID_DAILY_LIMIT=10
```

Use a separate key and balance for staging, and a real phone you control. Staging continues to deliver email to its private Mailpit inbox, so retrieve the email confirmation there. Linking a number still requires explicit action and consent. Keep `STAGING_APP_URL` public over HTTPS so signed replies can reach the staging app. A balance above the 20-credit reserve is needed to test activity messages. Set `STAGING_SMS_PROVIDER=none` when finished; history and opt-outs remain.

`compose.staging.yaml` supplies these variables to both the app and worker. Build the branch's image and deploy its digest as described in [the staging guide](STAGING.md). Use the matching Compose definition so both app and worker receive the SMS settings.

## Twilio remains available

Set `SMS_PROVIDER=twilio` and configure `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, and `TWILIO_VERIFY_SERVICE_SID`. For staging use `STAGING_SMS_PROVIDER=twilio` and the corresponding `STAGING_TWILIO_...` values. Use separate staging resources.

Configure the Verify service with the friendly name **Little Hint** and six-digit codes. Twilio controls Verify message formatting; Little Hint limits code acceptance to five minutes. Activity SMS uses the same fixed branded message as Textbelt. Configure your sender's incoming-message webhook to `https://your-origin/api/hooks/twilio/inbound`, using POST, and enable Twilio opt-out handling. The app supplies the signed status callback URL on each activity send. Inbound and status callbacks require a valid Twilio signature. Twilio sender registration and messaging eligibility remain provider requirements.

Changing providers invalidates pending codes bound to the old provider account. Phone ownership, notification choices, consent receipts, opt-outs and usage history survive. There is no automatic provider fallback. Restart app and worker together when changing provider settings.

## Consent and recovery

Little Hint stores append-only consent receipts in PostgreSQL for verification requests, SMS sign-in, recurring notifications, withdrawals and signed STOP/START replies. Receipts include the account, normalized phone, purpose, disclosure text/version, time and source. Back up `app_record` with the rest of the application database. Routine maintenance does not delete these receipts.

STOP disables activity messages locally when a signed reply reaches the app. Textbelt also processes STOP itself. START clears transport suppression but never restores notification consent: the user must explicitly enable updates in Settings again. Provider suppression can also prevent verification and sign-in codes. Use email or a passkey for recovery. During live acceptance, verify that your provider forwards STOP/START callbacks for your sender. A provider-side block may remain even when the application has not received a reply callback.

Phone changes/removal and SMS sign-in changes require an email confirmation within the current session, valid for ten minutes. A phone belongs to at most one verified account.

There is no account-erasure UI. When an operator performs an approved account erasure, include that user's `smsConsents`, `smsChallenges`, and `smsGrants` records in the erasure, remove their preference record, and clear `userId` and `phone` in their `smsAttempts` while retaining nonidentifying counts/statuses for shared budgets. Account deletion from the authentication table alone does not erase application records. Apply your backup-erasure policy too.

## Spending and delivery behavior

Textbelt quota comes from its `/quota/<key>` endpoint and send responses. Keys, OTP response fields and provider URLs never reach the browser or logs. The usage panel reports submissions, accepted/delivered/failed/uncertain outcomes, skipped reasons and provider history. Accepted is not proof of delivery. No package prices or dollar estimates are assumed.

A shared PostgreSQL lock serializes provider submissions across app and worker, with Textbelt submissions spaced at least a second apart. An attempt is recorded before the external call. A crash or ambiguous timeout leaves it uncertain and consumes its reserved budget. Such messages are never automatically resent, even through an administrator job retry. Failed attempts also keep their activity budget reservation. Quota accounting subtracts unresolved submissions conservatively. Use a dedicated key per environment.

If quota is unavailable or stale, paid Textbelt sends stop. Last known balance is labeled, never displayed as a fresh zero. Low credit triggers at most one email alert attempt per administrator per day, never another paid text. At a budget limit or the code reserve, activity updates are skipped permanently. Refilling credit does not create a backlog. Other notification channels continue normally. Email/passkey sign-in does not depend on SMS credit.

Textbelt delivery status is polled for accepted submissions for up to seven days. Unresolved sends retain their last known status. Historical messages keep their original provider; switching does not resubmit them.

### Troubleshooting a rejected code request

In Administration → This month's usage → SMS, expand **SMS delivery and skipped updates**. The panel shows the ten newest failed or uncertain submissions this month, including the time, provider, purpose and reason. For new Textbelt rejections, it also shows the provider's error explanation with the API key, OTP, phone numbers, email addresses, URLs and long tokens redacted. Raw responses are never stored or logged. These details are administrator-only; public sign-in responses remain generic.

`provider rejected` means Textbelt returned `success: false`. An unchanged positive balance rules out depleted credit, but does not establish why sending was refused. `submission unknown` means the app could not confirm the submission, including a timeout or unreadable response. Do not repeatedly request codes to diagnose either outcome. Both consume the app's request allowance: 60 seconds between requests, three per hour and five per rolling day across sign-in and phone verification.

Attempts without a recorded explanation cannot recover their original provider response. After deploying the diagnostic change, wait until the code-request allowance permits one controlled retry, then read the new explanation. If Textbelt requires account or sender approval, resolve that with Textbelt before retrying. Do not disable consent checks, increase rate limits, or change the credit reserve to work around a provider rejection.

## Terms and live acceptance

The implementation follows Textbelt's [opt-in, sender identification and recurring-message opt-out requirements](https://textbelt.com/tos/). Ordinary requested app updates are not giveaway offers. The app sends no promotional or payment SMS, and its templates contain no URLs requiring Textbelt URL activation. See the [SMS API](https://docs.textbelt.com/) and [OTP API](https://textbelt.com/otp-sms-verification-api/) for provider behavior.

Automated tests use mocked provider responses and isolated PostgreSQL databases. Before relying on live delivery in each environment:

- Link a controlled phone, then separately enable notifications and SMS sign-in. Test email/passkey recovery.
- Trigger an eligible exchange or access-loss event; check one submission, actual handset delivery, status and quota change. Check that email still arrives if SMS is capped.
- Reply STOP, confirm local/provider suppression, then reply START and explicitly opt back into notifications. Test app-side disable too.
- Exercise the code reserve and refill with small test limits. Skipped events must remain skipped. Verify webhook reachability and provider-specific Verify formatting.

No live paid delivery is claimed by automated test results. Use real credentials only in deployment settings, never in test fixtures.
