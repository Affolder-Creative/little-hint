import { Users } from "lucide-react";
import { formatPrice } from "../shared/price";
import { noteText } from "../shared/helpful-note";
import { priorityLabels } from "../shared/organization";
import { Link } from "react-router-dom";
import type { CoManagementView, RecoveredDraft } from "../shared/co-management";
import { useApp } from "./context";
import { Action } from "./Action";
import { Confirm } from "./Confirm";
import { Field, Form } from "./components";

type Arrangement = CoManagementView["arrangements"][number];

export function CoManagementScope() {
  return (
    <div className="notice">
      <p>
        Co-managers can maintain all current and future wish lists for this
        person alone, including unshared lists. They can add and edit items,
        share lists with this person's groups, and change permitted list
        settings.
      </p>
      <p>
        They can see group names needed for sharing, but do not join those
        groups. Joint lists are excluded. Event organizers keep control of
        event-list settings.
      </p>
      <p>
        Personal drafts stay private. Account settings, recipients, permanent
        deletion, and choosing other co-managers stay with the account holder.
        Either person can end co-management at any time.
      </p>
      <p>
        Co-managers can still buy gifts. Giving access permanently locks each
        eligible list's gifting mode and time zone, with the usual restrictions
        on reveal dates, even if co-management later ends.
      </p>
    </div>
  );
}

function ArrangementRow({ arrangement }: { arrangement: Arrangement }) {
  const { world, mutate, open, close, toast } = useApp();
  const owner = arrangement.ownerId === world.me.id;
  const helper = arrangement.helperId === world.me.id;
  const pending = arrangement.status === "pending";
  const canRespond =
    pending && arrangement.requestedBy !== world.me.id && (owner || helper);
  const canEnd =
    (owner || helper) &&
    (arrangement.status === "active" ||
      (pending && arrangement.requestedBy === world.me.id));
  const personLabel = owner ? arrangement.helperName : arrangement.ownerName;
  return (
    <div className="invitation-row">
      <div>
        <strong>
          {owner
            ? arrangement.helperName
            : `${arrangement.helperName} helps ${arrangement.ownerName}`}
        </strong>
        <p>
          {pending
            ? `Waiting for ${arrangement.requestedBy === arrangement.ownerId ? arrangement.helperName : arrangement.ownerName} to accept`
            : "Active co-manager"}
        </p>
        {pending && (
          <small>
            Expires {new Date(arrangement.expiresAt).toLocaleDateString()}
          </small>
        )}
        {!owner && arrangement.status === "active" && (
          <Link to={`/people/${arrangement.personId}`}>
            Manage wishes for {arrangement.ownerName}
          </Link>
        )}
      </div>
      <div className="invitation-actions">
        {canRespond && (
          <>
            <button
              className="button small"
              onClick={() =>
                open(
                  owner
                    ? `Let ${arrangement.helperName} co-manage your wishes?`
                    : `Co-manage wishes for ${arrangement.ownerName}?`,
                  <Form
                    submit="Accept co-management"
                    cancel={close}
                    onSubmit={async () => {
                      await mutate("co-management/respond", {
                        id: arrangement.id,
                        accept: true,
                      });
                      close();
                      toast("Co-management is now active.");
                    }}
                  >
                    <CoManagementScope />
                  </Form>,
                )
              }
            >
              Review and accept
            </button>
            <Action
              secondary
              onClick={() =>
                mutate("co-management/respond", {
                  id: arrangement.id,
                  accept: false,
                })
              }
            >
              Decline
            </Action>
          </>
        )}
        {canEnd && (
          <button
            className="text-button"
            onClick={() =>
              open(
                pending
                  ? "Cancel co-management request?"
                  : owner
                    ? `Remove ${personLabel} as co-manager?`
                    : `Stop co-managing ${personLabel}'s wishes?`,
                <Confirm
                  label={
                    pending
                      ? "Cancel request"
                      : owner
                        ? "Remove co-manager"
                        : "Leave co-management"
                  }
                  onConfirm={async () => {
                    await mutate("co-management/end", { id: arrangement.id });
                    toast(
                      pending ? "Request cancelled." : "Co-management ended.",
                    );
                  }}
                >
                  {pending
                    ? "This request will no longer be available to accept."
                    : "Editing access ends immediately. Published items and edits remain. Personal drafts stay private and recoverable. Gift commitments follow the remaining viewing permissions."}
                </Confirm>,
              )
            }
          >
            {pending ? "Cancel request" : owner ? "Remove co-manager" : "Leave"}
          </button>
        )}
      </div>
    </div>
  );
}

export function PersonCoManagement({ personId }: { personId: string }) {
  const { world, mutate, open, close, toast } = useApp();
  const person = world.people.find((p) => p.id === personId);
  const data = world.coManagement;
  if (!person?.userId || person.userId === world.me.id || !data) return null;
  const arrangements = data.arrangements.filter(
    (r) => r.personId === personId && ["pending", "active"].includes(r.status),
  );
  const mine = arrangements.find((r) => r.helperId === world.me.id);
  const eligible = data.candidates.some((c) => c.personId === personId);
  if (!mine && !eligible) return null;
  return (
    <button
      className="text-button"
      onClick={() => {
        if (!mine) {
          open(
            `Ask to co-manage ${person.name}'s wishes`,
            <Form
              submit="Send request"
              cancel={close}
              onSubmit={async () => {
                await mutate("co-management/request", {
                  personId,
                  helperId: world.me.id,
                });
                close();
                toast("Request sent. Access begins after they accept.");
              }}
            >
              <CoManagementScope />
              <p>They have seven days to accept this request.</p>
            </Form>,
          );
        } else {
          open(
            mine.status === "active" ? "Co-managers" : "Co-management request",
            <div>
              {arrangements.map((r) => (
                <ArrangementRow key={r.id} arrangement={r} />
              ))}
            </div>,
          );
        }
      }}
    >
      <Users size={17} aria-hidden="true" />
      {mine?.status === "active"
        ? "Manage co-management"
        : mine
          ? "Co-management request"
          : "Ask to co-manage"}
    </button>
  );
}

export function CoManagementSettings() {
  const { world, mutate, open, close, toast } = useApp();
  const data = world.coManagement;
  const person = world.people.find((p) => p.userId === world.me.id);
  if (!data || !person) return null;
  const current = data.arrangements.filter((r) =>
    ["pending", "active"].includes(r.status),
  );
  const own = current.filter((r) => r.ownerId === world.me.id);
  const helping = current.filter(
    (r) => r.helperId === world.me.id && r.ownerId !== world.me.id,
  );
  const candidates = data.candidates.filter(
    (c) =>
      c.userId !== world.me.id && !own.some((r) => r.helperId === c.userId),
  );
  return (
    <>
      <h2 id="settings-co-management-title">Wish-list co-managers</h2>
      <p>
        Let someone you trust maintain your wishes while you keep your own
        account.
      </p>
      <button
        className="button"
        disabled={!candidates.length}
        onClick={() =>
          open(
            "Invite a wish-list co-manager",
            <Form
              submit="Send invitation"
              cancel={close}
              onSubmit={async (f) => {
                await mutate("co-management/request", {
                  personId: person.id,
                  helperId: String(f.get("helperId")),
                });
                close();
                toast("Invitation sent. Access begins after they accept.");
              }}
            >
              <Field label="Connected person">
                <select name="helperId" required defaultValue="">
                  <option value="" disabled>
                    Choose someone
                  </option>
                  {candidates.map((c) => (
                    <option key={c.userId} value={c.userId}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <CoManagementScope />
              <p>The invitation expires after seven days.</p>
            </Form>,
          )
        }
      >
        Invite a co-manager
      </button>
      {!candidates.length && (
        <p className="muted">
          No other connected people are available to invite. Connect through a
          family group or existing sharing first.
        </p>
      )}
      <h3>Your co-managers</h3>
      {own.length ? (
        own.map((r) => <ArrangementRow key={r.id} arrangement={r} />)
      ) : (
        <p>No one currently co-manages your wish lists.</p>
      )}
      <h3>People you help</h3>
      {helping.length ? (
        helping.map((r) => <ArrangementRow key={r.id} arrangement={r} />)
      ) : (
        <p>Visit someone in Your people to ask to co-manage their wishes.</p>
      )}
      <RecoveredCoManagementDrafts />
    </>
  );
}

export function recoveredDraftContent(draft: RecoveredDraft) {
  const { id, revision, createdAt, userId, sourceId, ...content } = draft;
  return content;
}

export function RecoveredCoManagementDrafts() {
  const { world, mutate, open, toast } = useApp();
  const drafts = world.coManagement?.recoveredDrafts ?? [];
  if (!drafts.length) return null;
  return (
    <section aria-labelledby="recovered-wish-drafts-title">
      <h3 id="recovered-wish-drafts-title">Recovered personal drafts</h3>
      <p>
        These are your unpublished items from lists you can no longer manage.
        Only you can see these copies. Copy what you need or download the
        complete draft, including its formatted note and photo links, before
        discarding it.
      </p>
      {drafts.map((draft) => {
        const photos = [
          ...new Set([...(draft.images ?? []), draft.image].filter(Boolean)),
        ];
        const text = [
          draft.title,
          draft.descriptionRich
            ? noteText(draft.descriptionRich)
            : draft.description,
          draft.url,
          formatPrice(draft),
          `Quantity: ${draft.quantity}`,
          draft.tags.length ? `Tags: ${draft.tags.join(", ")}` : "",
          draft.priority ? `Priority: ${priorityLabels[draft.priority]}` : "",
          ...photos.map((photo, index) => `Photo ${index + 1}: ${photo}`),
        ]
          .filter(Boolean)
          .join("\n\n");
        return (
          <details key={draft.id} className="policy-options">
            <summary>{draft.title || "Untitled item"}</summary>
            <Field label={`Copyable draft: ${draft.title || "Untitled item"}`}>
              <textarea
                readOnly
                rows={5}
                value={text}
                onFocus={(event) => event.currentTarget.select()}
              />
            </Field>
            {photos.length > 0 && (
              <p className="actions">
                {photos.map((photo, index) => (
                  <a
                    key={photo}
                    className="text-button"
                    href={photo}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open photo {index + 1}
                  </a>
                ))}
              </p>
            )}
            <div className="actions">
              <Action
                secondary
                onClick={async () => {
                  await navigator.clipboard.writeText(text);
                  toast("Draft copied.");
                }}
              >
                Copy draft
              </Action>
              <Action
                secondary
                onClick={async () => {
                  const url = URL.createObjectURL(
                    new Blob(
                      [JSON.stringify(recoveredDraftContent(draft), null, 2)],
                      { type: "application/json" },
                    ),
                  );
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = "recovered-wish-draft.json";
                  document.body.append(link);
                  link.click();
                  link.remove();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                Download complete draft
              </Action>
              <button
                className="text-button danger"
                onClick={() =>
                  open(
                    "Discard this recovered draft?",
                    <Confirm
                      label="Discard draft"
                      onConfirm={() =>
                        mutate("co-management/discard-draft", { id: draft.id })
                      }
                    >
                      This permanently removes your private recovered copy.
                    </Confirm>,
                  )
                }
              >
                Discard
              </button>
            </div>
          </details>
        );
      })}
    </section>
  );
}
