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
