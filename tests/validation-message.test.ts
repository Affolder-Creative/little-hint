import { describe, expect, it } from "vitest";
import { z } from "zod";
import { validationMessage } from "../src/server/validation-message";
import { actionError } from "../src/client/copy";

function message(schema: z.ZodType, input: unknown) {
  const result = schema.safeParse(input);
  if (result.success) throw new Error("Expected invalid test input");
  return validationMessage(result.error);
}

describe("plain-language validation", () => {
  it("names visible fields and explains length, quantity, and privacy choices", () => {
    expect(
      message(
        z.object({
          title: z.string().min(1),
          quantity: z.number().int().max(999),
          mode: z.enum(["surprise", "transparent"]),
        }),
        { title: "", quantity: 1000, mode: "private" },
      ),
    ).toBe(
      "Item name: use at least 1 character. Quantity: enter a number no greater than 999. Gift privacy: choose Keep it a surprise or See the plans.",
    );
  });
  it("uses dollars instead of exposing cent-based bounds", () => {
    expect(
      message(z.object({ amountCents: z.number().positive() }), {
        amountCents: 0,
      }),
    ).toBe("Contribution amount: enter an amount greater than $0.00.");
    expect(
      message(z.object({ priceCents: z.number().max(100000000) }), {
        priceCents: 100000001,
      }),
    ).toBe("Price: enter an amount no greater than $1,000,000.00.");
  });
  it("does not expose nested IDs, submitted values, or custom library messages", () => {
    const result = message(
      z.object({
        participantIds: z.array(z.string().uuid()),
        privateInternalField: z
          .string()
          .refine(() => false, "Private diagnostic"),
      }),
      {
        participantIds: ["secret-id", "another-secret"],
        privateInternalField: "secret-value",
      },
    );
    expect(result).toBe(
      "People taking part: check each entry and try again. Some details are missing or invalid. Check the form and try again.",
    );
    expect(result).not.toMatch(
      /secret|privateInternalField|Private diagnostic|UUID/,
    );
  });
  it("limits errors and preserves a useful fallback for root-level failures", () => {
    expect(message(z.object({}), null)).toBe(
      "Some details are missing or invalid. Check the form and try again.",
    );
    expect(
      message(
        z.object({
          name: z.string(),
          title: z.string(),
          email: z.string(),
          phone: z.string(),
        }),
        {},
      ),
    ).not.toContain("Phone number");
  });
  it("offers recovery for browser failures and preserves useful application errors", () => {
    expect(actionError(new TypeError("Failed to fetch"))).toContain(
      "Check your connection",
    );
    expect(actionError(new SyntaxError("Unexpected token <"))).toContain(
      "Refresh and try again",
    );
    expect(actionError(new Error("That quantity is already reserved."))).toBe(
      "That quantity is already reserved.",
    );
    expect(actionError(null)).toBe(
      "We could not complete that action. Please try again.",
    );
  });
});
