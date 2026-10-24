// Display labels only. Stored settings and status values keep their API names.
export function actionError(error: unknown): string {
  if (error instanceof TypeError)
    return "We could not reach Little Hint. Check your connection and try again.";
  if (error instanceof SyntaxError)
    return "We could not read the update from Little Hint. Refresh and try again.";
  return error instanceof Error && error.message.trim()
    ? error.message
    : "We could not complete that action. Please try again.";
}

export const contributionStatus = {
  pledged: "Not sent yet",
  sent: "Sent · Awaiting confirmation",
  received: "Received",
  cancelled: "Cancelled",
} as const;

export const settingLabels: Record<string, string> = {
  SMTP_HOST: "Email server address",
  SMTP_PORT: "Email server port",
  SMTP_USER: "Email account username",
  SMTP_PASS: "Email account password",
  SMTP_FROM: "Sender name and email address",
  TELEGRAM_BOT_TOKEN: "Telegram bot token",
  TELEGRAM_BOT_NAME: "Telegram bot username",
  TWILIO_ACCOUNT_SID: "Twilio account ID",
  TWILIO_AUTH_TOKEN: "Twilio access token",
  TWILIO_FROM: "Phone number to send texts from",
  TWILIO_VERIFY_SERVICE_SID: "Twilio verification service ID",
  OPENAI_API_KEY: "OpenAI API key",
  OPENAI_MODEL: "AI model",
  PAID_DAILY_LIMIT: "Daily limit for paid requests",
};

export const settingSources: Record<string, string> = {
  environment: "Set on the server",
  settings: "Saved here",
  default: "Default",
  staging: "Test setting",
};
