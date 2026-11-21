import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Household } from "../shared/model";
import type { DirectoryGroup } from "./AdminRoles";
import { api } from "./api";
import { useApp } from "./context";
import { Action } from "./Action";
import { ActionMenu } from "./Management";
import { Confirm } from "./Confirm";
import { Field, Form } from "./components";
import { InviteDialog } from "./InvitationShare";

const tabs = ["Members", "Invitations", "Households", "Settings"] as const;

export function AdminGroupDetail({
  id,
  active,
}: {
  id: string;
  active: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const heading = useRef<HTMLHeadingElement>(null);
  const tab =
    tabs.find((t) => t.toLowerCase() === params.get("adminTab")) ?? "Members";
  const query = useQuery({
    queryKey: ["admin-groups", "detail", id],
    enabled: active,
    queryFn: () =>
      api<DirectoryGroup>(`admin/groups/${encodeURIComponent(id)}`),
  });
  useEffect(() => {
    if (active) heading.current?.focus();
  }, [active, query.isPending, query.error]);
  return (
    <div hidden={!active}>
      <button
        className="text-button"
        onClick={() =>
          setParams((current) => {
            const next = new URLSearchParams(current);
            next.delete("adminGroup");
            next.delete("adminTab");
            return next;
          })
        }
      >
        Back to all family groups
      </button>
      <section
        className="admin-panel admin-group-detail"
        aria-label="Manage family group"
      >
        <h3 ref={heading} tabIndex={-1}>
          {query.data?.name ?? "Family group"}
        </h3>
        {query.isPending && <p role="status">Loading family group…</p>}
        {query.error && (
          <p role="alert">
            This group could not be loaded. It may have been removed or your
            access may have changed.{" "}
            <Action secondary onClick={() => query.refetch()}>
              Try again
            </Action>
          </p>
        )}
        {query.data && (
          <div hidden={!!query.error}>
            <p className="muted">
              Primary owner:{" "}
              {query.data.members.find((m) => m.userId === query.data.ownerId)
                ?.name ?? "Unavailable"}
            </p>
            <nav className="admin-group-tabs" aria-label="Group management">
              {tabs.map((name) => (
                <button
                  key={name}
                  className="text-button"
                  aria-current={name === tab ? "page" : undefined}
                  onClick={() =>
                    setParams((current) => {
                      const next = new URLSearchParams(current);
                      next.set("adminTab", name.toLowerCase());
                      return next;
                    })
                  }
                >
                  {name}
                  {name === "Invitations" && query.data.requests.length > 0
                    ? ` (${query.data.requests.length})`
                    : ""}
                </button>
              ))}
            </nav>
            <GroupTasks group={query.data} tab={tab} />
          </div>
        )}
      </section>
    </div>
  );
}

function GroupTasks({ group: g, tab }: { group: DirectoryGroup; tab: string }) {
  const { open, close, mutate, toast } = useApp();
  const cache = useQueryClient();
  const save = async (path: string, body: unknown) => {
    try {
      await mutate(path, body);
    } finally {
      await cache.invalidateQueries({ queryKey: ["admin-groups"] });
    }
  };
  const changeRole = (
    userId: string,
    role: "admins" | "event-leaders",
    current: string[],
  ) =>
    save(`groups/${role}`, {
      groupId: g.id,
      revision: g.revision,
      userIds: current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    });
  const householdForm = (household?: Household) =>
    open(
      household ? "Rename household" : "Create household",
      <Form
        submit={household ? "Save name" : "Create household"}
        cancel={close}
        onSubmit={async (f) => {
          await save(household ? "households/update" : "households", {
            ...(household
              ? { id: household.id, revision: household.revision }
              : { groupId: g.id }),
            name: f.get("name"),
          });
          close();
        }}
      >
        <Field label="Household name">
          <input
            autoFocus
            name="name"
            required
            maxLength={160}
            defaultValue={household?.name}
          />
        </Field>
      </Form>,
    );
  return (
    <>
      <div hidden={tab !== "Members"}>
        <p className="muted">
          Family admins manage this group. Event leaders manage its events. The
          primary owner keeps ownership.
        </p>
        {g.members.map((m) => (
          <div className="admin-directory-row" key={m.userId}>
            <div>
              <strong>{m.name}</strong>
              <p className="muted">
                {[
                  m.userId === g.ownerId
                    ? "Primary owner"
                    : g.adminIds?.includes(m.userId)
                      ? "Family admin"
                      : "Member",
                  g.eventLeaderIds?.includes(m.userId) ? "Event leader" : "",
                  m.admin ? "App admin · all groups" : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            {m.userId !== g.ownerId && (
              <ActionMenu name={m.name}>
                <Action
                  secondary
                  onClick={() =>
                    changeRole(m.userId, "admins", g.adminIds ?? [])
                  }
                >
                  {g.adminIds?.includes(m.userId)
                    ? "Remove family admin role"
                    : "Make family admin"}
                </Action>
                <Action
                  secondary
                  onClick={() =>
                    changeRole(
                      m.userId,
                      "event-leaders",
                      g.eventLeaderIds ?? [],
                    )
                  }
                >
                  {g.eventLeaderIds?.includes(m.userId)
                    ? "Remove event leader role"
                    : "Make event leader"}
                </Action>
                {m.admin && (
                  <p className="muted">
                    App administrator access remains. Manage it under App
                    administrators.
                  </p>
                )}
                <button
                  className="text-button danger"
                  onClick={() =>
                    open(
                      "Remove this member?",
                      <Confirm
                        label="Remove member"
                        onConfirm={() =>
                          save("groups/remove", {
                            groupId: g.id,
                            userId: m.userId,
                          })
                        }
                      >
                        Remove {m.name} from {g.name}? Their account remains.
                        {m.admin
                          ? " They will still have app administrator access."
                          : ""}
                      </Confirm>,
                    )
                  }
                >
                  Remove member
                </button>
              </ActionMenu>
            )}
          </div>
        ))}
      </div>
      <div hidden={tab !== "Invitations"} className="text-stack">
        <div>
          <button
            className="button secondary"
            onClick={() =>
              open(
                `Invite someone to ${g.name}`,
                <InviteDialog
                  groupId={g.id}
                  onCreated={() =>
                    cache.invalidateQueries({ queryKey: ["admin-groups"] })
                  }
                />,
              )
            }
          >
            Invite someone
          </button>
        </div>
        <h4>Requests to invite</h4>
        {!g.requests.length && (
          <p className="muted">No requests waiting for approval.</p>
        )}
        {g.requests.map((r) => (
          <div className="invitation-row" key={r.id}>
            <span>{r.email}</span>
            <div className="actions">
              <Action
                secondary
                onClick={() =>
                  save("groups/respond-invitation", {
                    id: r.id,
                    decision: "approve",
                  })
                }
              >
                Approve and send
              </Action>
              <Action
                secondary
                onClick={() =>
                  save("groups/respond-invitation", {
                    id: r.id,
                    decision: "decline",
                  })
                }
              >
                Decline
              </Action>
            </div>
          </div>
        ))}
        <h4>Pending invitations</h4>
        {!g.invitations.length && (
          <p className="muted">No pending invitations.</p>
        )}
        {g.invitations.map((i) => (
          <div className="invitation-row" key={i.id}>
            <span>{i.email}</span>
            <Action
              secondary
              onClick={() => save("invitations/revoke", { id: i.id })}
            >
              Cancel invitation
            </Action>
          </div>
        ))}
      </div>
      <div hidden={tab !== "Households"} className="text-stack">
        <p className="muted">
          Households help avoid matching people who live together in gift
          exchanges.
        </p>
        <div>
          <button className="button secondary" onClick={() => householdForm()}>
            Create household
          </button>
        </div>
        {!g.households.length && (
          <p>
            No households yet. Create one to organize people who live together.
          </p>
        )}
        {g.households.map((h) => (
          <div key={h.id} className="admin-directory-row">
            <div>
              <strong>{householdName(g, h)}</strong>
              <p className="muted">
                {g.people
                  .filter((p) => p.householdIds.includes(h.id))
                  .map((p) => p.name)
                  .join(", ") || "No people assigned"}
              </p>
            </div>
            <ActionMenu name={householdName(g, h)}>
              <button className="text-button" onClick={() => householdForm(h)}>
                Rename household
              </button>
              <button
                className="text-button danger"
                onClick={() =>
                  open(
                    "Delete household?",
                    <Confirm
                      label="Delete household"
                      onConfirm={() =>
                        save("households/delete", {
                          id: h.id,
                          revision: h.revision,
                        })
                      }
                    >
                      Delete {h.name}? Members and wish lists remain.
                    </Confirm>,
                  )
                }
              >
                Delete household
              </button>
            </ActionMenu>
          </div>
        ))}
        {g.households.length > 0 && (
          <>
            <h4>People and households</h4>
            {g.people.map((p) => (
              <div key={p.id} className="admin-directory-row">
                <div>
                  <strong>{p.name}</strong>
                  <p className="muted">
                    {g.households
                      .filter((h) => p.householdIds.includes(h.id))
                      .map((h) => householdName(g, h))
                      .join(", ") || "No household"}
                  </p>
                </div>
                <button
                  className="text-button"
                  aria-label={`Edit households for ${p.name}`}
                  onClick={() =>
                    open(
                      `Households for ${p.name}`,
                      <Form
                        submit="Save households"
                        cancel={close}
                        onSubmit={async (f) => {
                          await save("households/memberships", {
                            groupId: g.id,
                            personId: p.id,
                            revision: p.revision,
                            householdIds: f.getAll("households"),
                          });
                          close();
                        }}
                      >
                        <fieldset className="choice-group">
                          <legend>Choose households</legend>
                          {g.households.map((h) => (
                            <label className="check" key={h.id}>
                              <input
                                type="checkbox"
                                name="households"
                                value={h.id}
                                defaultChecked={p.householdIds.includes(h.id)}
                              />
                              {householdName(g, h)}
                            </label>
                          ))}
                        </fieldset>
                      </Form>,
                    )
                  }
                >
                  Edit
                </button>
              </div>
            ))}
          </>
        )}
      </div>
      <div hidden={tab !== "Settings"}>
        <GroupNameForm
          group={g}
          save={save}
          onSaved={() => toast("Group name saved.")}
        />
        <p className="muted admin-owner-note">
          Primary owner:{" "}
          {g.members.find((m) => m.userId === g.ownerId)?.name ?? "Unavailable"}
          . Ownership changes require an accepted transfer.
        </p>
      </div>
    </>
  );
}

function householdName(group: DirectoryGroup, household: Household) {
  return group.households.filter((h) => h.name === household.name).length > 1
    ? `${household.name} · ${household.id.slice(0, 6)}`
    : household.name;
}

function GroupNameForm({
  group,
  save,
  onSaved,
}: {
  group: DirectoryGroup;
  save: (path: string, body: unknown) => Promise<void>;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState({
    name: group.name,
    revision: group.revision,
  });
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setDraft({ name: group.name, revision: group.revision });
  }, [group.name, group.revision, dirty]);
  return (
    <Form
      submit="Save group name"
      dirty={dirty}
      onSubmit={async () => {
        await save("groups/update", { groupId: group.id, ...draft });
        setDirty(false);
        onSaved();
      }}
      secondaryActions={() =>
        dirty ? (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setDraft({ name: group.name, revision: group.revision });
              setDirty(false);
            }}
          >
            Discard changes
          </button>
        ) : null
      }
    >
      <Field label="Group name">
        <input
          name="name"
          required
          maxLength={160}
          value={draft.name}
          onChange={(e) => {
            setDraft({ ...draft, name: e.target.value });
            setDirty(true);
          }}
        />
      </Field>
      {dirty && draft.revision !== group.revision && (
        <p role="status">
          This group changed while you were editing. Discard changes to load its
          current name before trying again.
        </p>
      )}
    </Form>
  );
}
