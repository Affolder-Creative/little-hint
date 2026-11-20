import "./admin-roles.css";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Group, Household } from "../shared/model";
import { api } from "./api";
import { useApp } from "./context";
import { Form, Field } from "./components";
import { Action } from "./Action";
import { Confirm } from "./Confirm";
import { InviteDialog } from "./InvitationShare";

type DirectoryGroup = Group & {
  members: Member[];
  households: Household[];
  people: Array<{
    id: string;
    name: string;
    revision: number;
    householdIds: string[];
  }>;
  invitations: Array<{ id: string; email: string }>;
  requests: Array<{ id: string; email: string }>;
};
type Member = { userId: string; name: string };
export function FamilyAdministrators({
  group,
  members,
}: {
  group: Group;
  members?: Member[];
}) {
  const { world, open, mutate } = useApp();
  const cache = useQueryClient();
  const people =
    members ??
    group.memberIds.map((userId) => ({
      userId,
      name: world.people.find((p) => p.userId === userId)?.name ?? "Member",
    }));
  if (!group.canAdminister) return null;
  return (
    <details className="family-admin-controls">
      <summary>Manage family group</summary>
      <div className="text-stack">
        <p className="muted">
          Family admins manage members and accessible shared content. The
          primary owner retains ownership.
        </p>
        <Form
          key={group.revision}
          submit="Save group"
          onSubmit={async (f) => {
            await mutate("groups/update", {
              groupId: group.id,
              revision: group.revision,
              name: f.get("name"),
            });
            await cache.invalidateQueries({ queryKey: ["admin-groups"] });
          }}
        >
          <Field label="Group name">
            <input
              name="name"
              required
              maxLength={160}
              defaultValue={group.name}
            />
          </Field>
        </Form>
        <Form
          key={`roles-${group.revision}`}
          submit="Save family admins"
          onSubmit={async (f) => {
            await mutate("groups/admins", {
              groupId: group.id,
              revision: group.revision,
              userIds: f.getAll("admins"),
            });
            await cache.invalidateQueries({ queryKey: ["admin-groups"] });
          }}
        >
          <fieldset className="choice-group">
            <legend>Family admins</legend>
            {people.map((p) => (
              <label className="check" key={p.userId}>
                <input
                  type="checkbox"
                  name="admins"
                  value={p.userId}
                  disabled={p.userId === group.ownerId}
                  defaultChecked={
                    p.userId === group.ownerId ||
                    group.adminIds?.includes(p.userId)
                  }
                />
                {p.name}
                {p.userId === group.ownerId ? " · Primary owner" : ""}
              </label>
            ))}
          </fieldset>
        </Form>
        {members && (
          <>
            <button
              className="button secondary"
              onClick={() =>
                open(
                  `Invite someone to ${group.name}`,
                  <InviteDialog groupId={group.id} />,
                )
              }
            >
              Invite someone
            </button>
            {people
              .filter((p) => p.userId !== group.ownerId)
              .map((p) => (
                <div className="invitation-row" key={p.userId}>
                  <span>{p.name}</span>
                  <button
                    className="text-button danger"
                    onClick={() =>
                      open(
                        "Remove this member?",
                        <Confirm
                          label="Remove member"
                          onConfirm={async () => {
                            await mutate("groups/remove", {
                              groupId: group.id,
                              userId: p.userId,
                            });
                            await cache.invalidateQueries({
                              queryKey: ["admin-groups"],
                            });
                          }}
                        >
                          Remove {p.name} from {group.name}? Their account
                          remains.
                        </Confirm>,
                      )
                    }
                  >
                    Remove member
                  </button>
                </div>
              ))}
          </>
        )}
      </div>
    </details>
  );
}
export function AppAdministrators() {
  const { open, mutate } = useApp();
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ["app-administrators"],
    queryFn: () =>
      api<Array<{ id: string; name: string; revision: number }>>(
        "admin/administrators",
      ),
  });
  return (
    <section className="admin-panel" aria-label="App administrators">
      <h3>App administrators</h3>
      <p>
        Admins manage the installation and content they can already access. Add
        an admin through Users &amp; profiles below.
      </p>
      {query.isPending ? (
        <p role="status">Loading administrators…</p>
      ) : query.error ? (
        <p role="alert">
          Could not load administrators.{" "}
          <Action secondary onClick={() => query.refetch()}>
            Retry
          </Action>
        </p>
      ) : (
        query.data?.map((p) => (
          <div className="invitation-row" key={p.id}>
            <span>{p.name}</span>
            <button
              className="text-button"
              disabled={query.data.length === 1}
              onClick={() =>
                open(
                  "Remove app administrator?",
                  <Confirm
                    label="Remove admin role"
                    onConfirm={async () => {
                      await mutate("admin/administrators", {
                        id: p.id,
                        revision: p.revision,
                        admin: false,
                      });
                      await cache.invalidateQueries({
                        queryKey: ["app-administrators"],
                      });
                      await cache.invalidateQueries({
                        queryKey: ["admin-profiles"],
                      });
                    }}
                  >
                    Remove administration access for {p.name}? Their account
                    remains.
                  </Confirm>,
                )
              }
            >
              Remove admin role
            </button>
          </div>
        ))
      )}
      <p className="muted">Keep at least one app administrator.</p>
    </section>
  );
}
export function AdminGroups() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["admin-groups", search, page],
    queryFn: () =>
      api<{ rows: DirectoryGroup[]; total: number }>(
        `admin/groups?${new URLSearchParams({ search, page: String(page) })}`,
      ),
  });
  return (
    <section className="admin-panel" aria-label="All family groups">
      <h3>All family groups</h3>
      <p>
        Manage group membership and administrators. Gift access still follows
        normal sharing.
      </p>
      <Field label="Find a family group">
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </Field>
      {query.isPending ? (
        <p role="status">Loading groups…</p>
      ) : query.error ? (
        <p role="alert">
          Could not load groups.{" "}
          <Action secondary onClick={() => query.refetch()}>
            Retry
          </Action>
        </p>
      ) : (
        <>
          {query.data.rows.length === 0 && <p>No family groups found.</p>}
          {query.data.rows.map((g) => (
            <div className="admin-group-row" key={g.id}>
              <h4>{g.name}</h4>
              <FamilyAdministrators group={g} members={g.members} />
              <DirectoryOperations group={g} />
            </div>
          ))}
          {query.data.total > 24 && (
            <div className="actions">
              <button
                className="button secondary"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span>Page {page}</span>
              <button
                className="button secondary"
                disabled={page * 24 >= query.data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function DirectoryOperations({ group: g }: { group: DirectoryGroup }) {
  const { mutate, open } = useApp();
  const cache = useQueryClient();
  const save = async (path: string, body: unknown) => {
    await mutate(path, body);
    await cache.invalidateQueries({ queryKey: ["admin-groups"] });
  };
  return (
    <details className="family-admin-controls">
      <summary>Invitations, households and event leaders</summary>
      <div className="text-stack">
        {g.requests.map((r) => (
          <div className="invitation-row" key={r.id}>
            <span>{r.email} · Invitation request</span>
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
                Approve
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
        {g.invitations.map((i) => (
          <div className="invitation-row" key={i.id}>
            <span>{i.email} · Pending invitation</span>
            <Action
              secondary
              onClick={() => save("invitations/revoke", { id: i.id })}
            >
              Cancel invitation
            </Action>
          </div>
        ))}
        <Form
          key={`leaders-${g.revision}`}
          submit="Save event leaders"
          onSubmit={(f) =>
            save("groups/event-leaders", {
              groupId: g.id,
              revision: g.revision,
              userIds: f.getAll("leaders"),
            })
          }
        >
          <fieldset className="choice-group">
            <legend>Event leaders</legend>
            {g.members
              .filter((m) => m.userId !== g.ownerId)
              .map((m) => (
                <label className="check" key={m.userId}>
                  <input
                    name="leaders"
                    type="checkbox"
                    value={m.userId}
                    defaultChecked={g.eventLeaderIds?.includes(m.userId)}
                  />
                  {m.name}
                </label>
              ))}
          </fieldset>
        </Form>
        <h5>Households</h5>
        <Form
          submit="Create household"
          onSubmit={(f) =>
            save("households", { groupId: g.id, name: f.get("name") })
          }
        >
          <Field label="New household name">
            <input name="name" required maxLength={160} />
          </Field>
        </Form>
        {g.households.map((h) => (
          <div key={h.id}>
            <Form
              key={h.revision}
              submit="Rename household"
              onSubmit={(f) =>
                save("households/update", {
                  id: h.id,
                  revision: h.revision,
                  name: f.get("name"),
                })
              }
            >
              <Field label="Household name">
                <input
                  name="name"
                  required
                  maxLength={160}
                  defaultValue={h.name}
                />
              </Field>
            </Form>
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
          </div>
        ))}
        {g.households.length > 0 &&
          g.people.map((p) => (
            <Form
              key={`${p.id}-${p.revision}`}
              submit="Save households"
              onSubmit={(f) =>
                save("households/memberships", {
                  groupId: g.id,
                  personId: p.id,
                  revision: p.revision,
                  householdIds: f.getAll("households"),
                })
              }
            >
              <fieldset className="choice-group">
                <legend>Households for {p.name}</legend>
                {g.households.map((h) => (
                  <label className="check" key={h.id}>
                    <input
                      name="households"
                      type="checkbox"
                      value={h.id}
                      defaultChecked={p.householdIds.includes(h.id)}
                    />
                    {h.name}
                  </label>
                ))}
              </fieldset>
            </Form>
          ))}
      </div>
    </details>
  );
}
