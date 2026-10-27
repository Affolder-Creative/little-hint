import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { emptyState, type State } from "../src/shared/model";
import { stamp, command } from "../src/server/domain";
const mock = vi.hoisted(() => ({
  state: null as State | null,
  sendMail: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("../src/server/db", () => ({
  readState: async () => mock.state,
  transact: async (fn: any) => fn(mock.state),
  pool: {
    query: async () => ({
      rows: [{ email: "buyer@example.test", name: "Buyer" }],
    }),
  },
}));
vi.mock("../src/server/settings", () => ({
  config: async () => ({
    SMTP_HOST: "smtp.example.test",
    SMTP_PORT: "465",
    SMTP_FROM: "Little Hint <hello@example.test>",
    TELEGRAM_BOT_TOKEN: "test-token",
  }),
  spend: async () => {},
}));
vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({ sendMail: mock.sendMail, close: () => {} }),
  },
}));
import { deliverNotice, isUSPhone } from "../src/server/notifications";
function fixture() {
  const s = emptyState();
  mock.state = s;
  const actors = ["Recipient", "Buyer"].map((name, i) => ({
    id: `user-${i}`,
    email: `${name}@example.test`,
    name,
  }));
  const people = actors.map((a) => ({
    ...stamp(),
    userId: a.id,
    name: a.name,
    guardians: [],
  }));
  s.people.push(...people);
  const group = {
    ...stamp(),
    name: "Family",
    ownerId: actors[0].id,
    memberIds: actors.map((a) => a.id),
  };
  s.groups.push(group);
  const list = command(s, actors[0], "lists.create", {
    name: "Wishes",
    ownerIds: [people[0].id],
    groupIds: [group.id],
    mode: "surprise",
  }) as any;
  const gift = command(s, actors[0], "items.create", {
    title: "Private gift description",
    listId: list.id,
  }) as any;
  const notice = {
    ...stamp(),
    userId: actors[1].id,
    event: "purchase" as const,
    itemId: gift.id,
    status: "pending" as const,
    attempts: 0,
    delivered: [],
  };
  s.notices.push(notice);
  s.preferences.push({
    ...stamp(),
    userId: actors[1].id,
    email: true,
    recipientUpdates: false,
    telegram: true,
    sms: false,
    events: ["purchase"],
    chatId: "123",
  });
  return { s, actors, group, notice };
}
beforeEach(() => {
  mock.sendMail.mockReset().mockResolvedValue({});
  mock.fetch.mockReset().mockResolvedValue(
    new Response(JSON.stringify({ ok: true, result: {} }), {
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", mock.fetch);
});
afterEach(() => vi.unstubAllGlobals());
describe("notification privacy and recovery", () => {
  it("finishes legacy wish-list notices with generic copy even after preview opt-in", async () => {
    const f = fixture();
    const list = f.s.lists[0];
    Object.assign(f.notice, { event: "wishlist", listId: list.id });
    command(f.s, f.actors[1], "follows.update", {
      target: "list",
      targetId: list.id,
      following: true,
    });
    f.s.preferences[0].events = ["wishlist"];
    f.s.preferences[0].notificationDetails = { email: true, telegram: true };
    await deliverNotice(f.notice.id);
    expect(mock.sendMail).toHaveBeenCalledOnce();
    expect(mock.sendMail.mock.calls[0][0].subject).toBe(
      "A little update from Little Hint",
    );
    expect(mock.sendMail.mock.calls[0][0].text).not.toContain(
      "Private gift description",
    );
    expect(f.notice.status).toBe("sent");
  });
  it("suppresses a queued notice when its recipient cannot see the event", async () => {
    const f = fixture();
    f.notice.userId = f.actors[0].id;
    await deliverNotice(f.notice.id);
    expect(mock.sendMail).not.toHaveBeenCalled();
    expect(mock.fetch).not.toHaveBeenCalled();
    expect(f.notice.status).toBe("sent");
  });
  it("rechecks access between channels after membership changes", async () => {
    const f = fixture();
    mock.sendMail.mockImplementation(async () => {
      f.group.memberIds = [f.actors[0].id];
    });
    await deliverNotice(f.notice.id);
    expect(mock.sendMail).toHaveBeenCalledOnce();
    expect(mock.fetch).not.toHaveBeenCalled();
    expect(f.notice.delivered).toEqual(["email"]);
  });
  it("retries provider failure with generic branded messages and completed-channel tracking", async () => {
    const f = fixture();
    mock.sendMail.mockRejectedValueOnce(new Error("Provider offline"));
    await expect(deliverNotice(f.notice.id)).rejects.toThrow("unavailable");
    expect(f.notice.attempts).toBe(1);
    expect(f.notice.status).toBe("pending");
    await deliverNotice(f.notice.id);
    expect(f.notice.status).toBe("sent");
    expect([...f.notice.delivered].sort()).toEqual(["email", "telegram"]);
    const mail = mock.sendMail.mock.calls[1][0];
    expect(mail.text).not.toContain("Private gift");
    expect(mail.html).not.toContain("Private gift");
    expect(mail.html).toContain("Open Little Hint");
    expect(mail.html).toContain(`/gift/${f.notice.itemId}`);
    expect(mail.subject).toBe("A little update from Little Hint");
    expect(mail.attachments[0].cid).toBe("little-hint-logo");
    await deliverNotice(f.notice.id);
    expect(mock.sendMail).toHaveBeenCalledTimes(2);
  });
  it("accepts US numbers and rejects other NANP countries", () => {
    expect(isUSPhone("+12025550123")).toBe(true);
    expect(isUSPhone("+14165550123")).toBe(false);
    expect(isUSPhone("+442079460123")).toBe(false);
    expect(isUSPhone("2025550123")).toBe(false);
  });
});
