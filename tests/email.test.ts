import { describe, expect, it } from "vitest";
import { renderEmail } from "../src/server/email";

describe("transactional email templates", () => {
  it("escapes opted-in wish-list summaries in subjects, previews and bodies", () => {
    const text = 'John added something to "Birthday <script> & wishes".';
    const mail = renderEmail(
      {
        kind: "update",
        text,
        wishlistPreview: text,
        actionPath: "/notifications/batches/example",
      },
      "https://hint.example.test",
    );
    expect(mail.subject).toBe(text);
    expect(mail.text).toContain(text);
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt; &amp; wishes");
    const generic = renderEmail(
      {
        kind: "update",
        text: "Open Little Hint to see it.",
        actionPath: "/notifications/batches/example",
      },
      "https://hint.example.test",
    );
    expect(generic.subject).toBe("A little update from Little Hint");
    expect(generic.html).not.toContain("John");
  });
  it("makes the code selectable and keeps it out of preview copy", () => {
    const mail = renderEmail(
      { kind: "sign-in", code: "012345" },
      "https://hint.example.test",
    );
    expect(mail.subject).toBe("Your Little Hint sign-in code");
    expect(mail.text).toContain("012345");
    expect(mail.text).toContain("10 minutes");
    expect(mail.html).toContain('lang="en"');
    expect(mail.html).toContain("cid:little-hint-logo");
    expect(mail.html).toContain(">012345</span>");
    expect(mail.html).toContain("Valid for 10 minutes");
    expect(mail.html.match(/mso-hide:all">([^<]+)/)?.[1]).not.toContain(
      "012345",
    );
  });
  it.each(["invitation", "account-invitation", "update"] as const)(
    "escapes %s text and keeps the action on the configured origin",
    (kind) => {
      const mail = renderEmail(
        {
          kind,
          text: 'A <script> & "private" note',
          actionPath: "/invite/example?x=1&y=2",
        },
        "https://hint.example.test",
      );
      expect(mail.html).not.toContain("<script>");
      expect(mail.html).toContain(
        "A &lt;script&gt; &amp; &quot;private&quot; note",
      );
      expect(mail.html).toContain(
        'href="https://hint.example.test/invite/example?x=1&amp;y=2"',
      );
      expect(mail.text).toContain(
        "https://hint.example.test/invite/example?x=1&y=2",
      );
      expect(mail.html).toContain(
        kind === "invitation" ? "View invitation" : "Open Little Hint",
      );
    },
  );
  it("gives account invitations a solo welcome without a group-acceptance action", () => {
    const mail = renderEmail(
      {
        kind: "account-invitation",
        text: "Start your own wish list.",
        actionPath: "/",
      },
      "https://hint.example.test",
    );
    expect(mail.subject).toBe("You're invited to Little Hint");
    expect(mail.html).toContain("Open Little Hint");
    expect(mail.html).toContain("You can choose who to share it with later.");
    expect(mail.html).not.toContain("Your people are waiting");
    expect(mail.html).not.toContain("View invitation");
    expect(mail.text).toContain("https://hint.example.test/");
  });
  it("rejects external and unsafe action URLs", () => {
    for (const actionPath of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
    ]) {
      expect(() =>
        renderEmail(
          { kind: "update", text: "An update", actionPath },
          "https://hint.example.test",
        ),
      ).toThrow();
    }
    expect(() =>
      renderEmail({ kind: "sign-in", code: "123456" }, "javascript:alert(1)"),
    ).toThrow();
  });
});
