import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "./api";
import { useApp } from "./context";
import { Field, Form } from "./components";
import { Action } from "./Action";
type Review = {
  token: string;
  counts: { lists: number; gifts: number; notes: number };
  blockers: {
    kind: string;
    id: string;
    title: string;
    candidates?: { id: string; name: string }[];
    detail: string;
  }[];
  candidates: { id: string; name: string }[];
};
export function AdminAccountDeletion({
  userId,
  name,
}: {
  userId: string;
  name: string;
}) {
  const client = useQueryClient();
  const { close, toast } = useApp();
  const [mode, setMode] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const query = useQuery({
    queryKey: ["admin-deletion", userId],
    queryFn: () =>
      api<Review>(`admin/accounts/${encodeURIComponent(userId)}/deletion`),
  });
  const refresh = () =>
    client.invalidateQueries({ queryKey: ["admin-deletion", userId] });
  if (query.isPending) return <p role="status">Reviewing account…</p>;
  if (query.error || !query.data)
    return (
      <p role="alert">
        Could not review this account.{" "}
        <button className="text-button" onClick={() => query.refetch()}>
          Try again
        </button>
      </p>
    );
  const review = query.data;
  return (
    <div>
      <p>
        Permanently delete the sign-in account for <strong>{name}</strong>. All
        of their sessions will end.
      </p>
      <p>
        {review.counts.lists} lists · {review.counts.gifts} gifts ·{" "}
        {review.counts.notes} notes are affected.
      </p>
      {!!review.blockers.length && (
        <section>
          <h3>Resolve these first</h3>
          {review.blockers.map((b) => (
            <div className="closure-blocker" key={b.id}>
              <h4>{b.title}</h4>
              <p>{b.detail}</p>
              {["guardian", "group"].includes(b.kind) &&
                !(b.candidates ?? review.candidates).length && (
                  <p>
                    No eligible person is available yet. Add a trusted member to
                    the family group before requesting this handoff.
                  </p>
                )}
              {["guardian", "group"].includes(b.kind) &&
                !!(b.candidates ?? review.candidates).length && (
                  <Form
                    submit="Request handoff"
                    onSubmit={async (data) => {
                      await api(
                        `admin/accounts/${encodeURIComponent(userId)}/resolve`,
                        {
                          kind: b.kind,
                          targetId: b.id,
                          userId: data.get("userId"),
                          confirmation: "RESOLVE",
                        },
                      );
                      await refresh();
                      toast(
                        "Handoff requested. The new owner must accept before deletion.",
                      );
                    }}
                  >
                    <Field label="New responsible person">
                      <select name="userId" required defaultValue="">
                        <option value="" disabled>
                          Choose a person
                        </option>
                        {(b.candidates ?? review.candidates).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {b.kind === "group" && (
                      <p>
                        Group ownership can only transfer to a current group
                        member.
                      </p>
                    )}
                  </Form>
                )}
              {b.kind === "commitments" && (
                <Form
                  submit="Cancel outstanding plans"
                  onSubmit={async () => {
                    await api(
                      `admin/accounts/${encodeURIComponent(userId)}/resolve`,
                      { kind: "commitments", confirmation: "RESOLVE" },
                    );
                    await refresh();
                  }}
                >
                  <label className="check">
                    <input type="checkbox" required />
                    Cancel this account's unpurchased reservations and unsent
                    pledges. Purchased quantities and sent contributions remain.
                  </label>
                </Form>
              )}
            </div>
          ))}
        </section>
      )}
      <Action secondary onClick={refresh}>
        Refresh review
      </Action>
      <Form
        submit="Delete account permanently"
        disabled={
          !!review.blockers.length || confirmation !== "DELETE" || !mode
        }
        onSubmit={async () => {
          await api(`admin/accounts/${encodeURIComponent(userId)}/delete`, {
            mode,
            confirmation,
            token: review.token,
          });
          await Promise.all([
            client.invalidateQueries({ queryKey: ["admin-profiles"] }),
            client.invalidateQueries({ queryKey: ["world"] }),
          ]);
          close();
          toast("Account deleted.");
        }}
      >
        <Field label="What should happen to their data?">
          <select
            required
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="" disabled>
              Choose what to keep
            </option>
            <option value="keep-shared">Keep shared content and history</option>
            <option value="remove-content">Remove their content</option>
          </select>
        </Field>
        <p>
          {mode === "keep-shared"
            ? "Private data is deleted. Shared content remains under Former member. Sole-owned shared lists and ideas are archived."
            : mode === "remove-content"
              ? "Their lists, authored gifts, and notes are removed. Other people's completed purchase and contribution history is kept anonymously."
              : "Both choices remove sign-in access, contact details, and private account settings. This cannot be undone."}
        </p>
        <Field label="Type DELETE to confirm">
          <input
            autoComplete="off"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            required
            pattern="DELETE"
          />
        </Field>
      </Form>
    </div>
  );
}
