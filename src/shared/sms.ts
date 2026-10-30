export const smsNotificationConsent =
  "I agree to receive recurring Little Hint app updates by SMS for my selected topics. Message and data rates may apply. Reply STOP to opt out, or turn off text messages in Settings. SMS is optional.";
export const smsLoginConsent =
  "Allow Little Hint to send a sign-in code when I request one using this verified mobile number. Message and data rates may apply. Email and passkeys remain available.";
export const smsVerificationConsent =
  "Send a Little Hint verification code to this number. Message and data rates may apply. This does not enable sign-in or recurring notifications.";
export const smsConsentVersion = "2026-10-30.1";
export const smsActivityMessage =
  "Little Hint: You have an update. Open the app to view it. Reply STOP to opt out.";
export const smsTopics = [
  "exchange",
  "access",
  "reservation",
  "purchase",
  "discussion",
] as const;
export interface SmsInfo {
  provider: "none" | "textbelt" | "twilio";
  available: boolean;
  eligibleEvents: string[];
  dailyLimit: number;
  monthlyLimit: number;
  reserve: number;
}

export const smsNotificationDisclosure = (daily: number) =>
  `${smsNotificationConsent} Up to ${daily} activity texts per day. Shared monthly limits also apply.`;
