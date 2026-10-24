import type { ZodError } from "zod";

// Never show schema paths, submitted values, or library diagnostics to users.
const fields: Record<string, string> = {
  name: "Name",
  title: "Item name",
  description: "Note",
  body: "Note",
  email: "Email address",
  phone: "Phone number",
  code: "Verification code",
  url: "Shop link",
  quantity: "Quantity",
  purchased: "Quantity purchased",
  count: "People each participant gives to",
  tags: "Tags",
  mode: "Gift privacy",
  visibility: "Who can see this idea",
  archiveAfter: "Archive date",
  revealAfter: "Gift summary date",
  timeZone: "Time zone",
  participantIds: "People taking part",
  ownerIds: "People this list is for",
  groupIds: "Family groups",
  householdIds: "Households",
  leaderIds: "Event leaders",
  userIds: "Event leaders",
  priceCents: "Price",
  amountCents: "Contribution amount",
  poolTargetCents: "Contribution goal",
};

export function validationMessage(error: ZodError): string {
  const messages = error.issues.map((issue) => {
    const key = String(issue.path[0] ?? "");
    const field = fields[key];
    if (!field)
      return "Some details are missing or invalid. Check the form and try again.";
    if (issue.path.length > 1)
      return `${field}: check each entry and try again.`;
    if (key === "mode")
      return "Gift privacy: choose Keep it a surprise or See the plans.";
    // Prices arrive in cents; show their bounds in the dollars used by the form.
    if (key.endsWith("Cents")) {
      if (issue.code === "too_small" || issue.code === "too_big") {
        const small = issue.code === "too_small";
        const limit = Number(small ? issue.minimum : issue.maximum) / 100;
        const amount = new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(limit);
        return `${field}: enter an amount ${issue.inclusive ? (small ? "of at least" : "no greater than") : small ? "greater than" : "less than"} ${amount}.`;
      }
      return `${field}: enter a dollar amount with no more than two decimal places.`;
    }
    if (issue.code === "too_small" || issue.code === "too_big") {
      const small = issue.code === "too_small";
      const limit = small ? issue.minimum : issue.maximum;
      if (issue.origin === "string")
        return `${field}: use ${small ? "at least" : "no more than"} ${limit} ${limit === 1 ? "character" : "characters"}.`;
      if (issue.origin === "array")
        return `${field}: choose ${small ? "at least" : "no more than"} ${limit}.`;
      if (issue.origin === "number")
        return `${field}: enter a number ${issue.inclusive ? (small ? "of at least" : "no greater than") : small ? "greater than" : "less than"} ${limit}.`;
    }
    if (issue.code === "invalid_type" && issue.expected === "number")
      return `${field}: enter a number.`;
    if (issue.code === "invalid_type" && issue.expected === "int")
      return `${field}: enter a whole number.`;
    if (key === "email")
      return "Email address: enter a complete address, such as name@example.com.";
    if (key === "url")
      return "Shop link: paste a full link starting with https:// or http://.";
    return `${field}: check your entry and try again.`;
  });
  return (
    [...new Set(messages)].slice(0, 3).join(" ") ||
    "Check the form and try again."
  );
}
