import "./admin-roles.css";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ActionMenu } from "./Management";
import { AddAdministrator } from "./AdminAppointment";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Group, Household } from "../shared/model";
import { api } from "./api";
import { useApp } from "./context";
import { Form, Field } from "./components";
import { Action } from "./Action";
import { Confirm } from "./Confirm";
import { InviteDialog } from "./InvitationShare";

export type DirectoryGroup = Group & {
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
type Member = { userId: string; name: string; admin?: boolean };
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
  const { world, open, mutate } = useApp();
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ["app-administrators"],
    queryFn: () =>
      api<
        Array<{
          id: string;
          userId: string;
          name: string;
          email?: string;
          revision: number;
        }>
      >("admin/administrators"),
  });
  return (
    <section className="admin-panel" aria-label="App administrators">
      <div className="admin-section-heading">
        <h3>App administrators</h3>
        <button
          className="button secondary"
          onClick={() => open("Add administrator", <AddAdministrator />)}
        >
          Add administrator
        </button>
      </div>
      <p>
        Manage this app and all family groups. Private content, gift surprises
        and secrets stay protected.
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
        query.data.map((p) => (
          <div className="admin-directory-row" key={p.id}>
            <div>
              <strong>
                {p.name}
                {p.userId === world.me.id ? " · You" : ""}
              </strong>
              {p.email && <p className="muted">{p.email}</p>}
            </div>
            {query.data.length > 1 && (
              <ActionMenu name={p.name}>
                <button
                  className="text-button danger"
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
                          await Promise.all(
                            [
                              "app-administrators",
                              "admin-profiles",
                              "admin-groups",
                            ].map((key) =>
                              cache.invalidateQueries({ queryKey: [key] }),
                            ),
                          );
                        }}
                      >
                        Remove administration access for {p.name}?
                        {p.userId === world.me.id
                          ? " You will lose access to Administration."
                          : " Their account remains."}
                      </Confirm>,
                    )
                  }
                >
                  Remove admin role
                </button>
              </ActionMenu>
            )}
          </div>
        ))
      )}
      {query.data?.length === 1 && (
        <p className="muted">
          Add another administrator before removing this role.
        </p>
      )}
    </section>
  );
}

export function AdminGroups() {
  const [params, setParams] = useSearchParams();
  const active = params.get("adminGroup");
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(1);
  const lastTrigger = useRef<HTMLButtonElement | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const position = useRef(0);
  const previous = useRef(active);
  useEffect(() => {
    if (previous.current && !active) {
      (lastTrigger.current?.isConnected
        ? lastTrigger.current
        : searchInput.current
      )?.focus({ preventScroll: true });
      window.scrollTo(0, position.current);
    }
    previous.current = active;
  }, [active]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useQuery({
    queryKey: ["admin-groups", "directory", term, page],
    queryFn: () =>
      api<{ rows: DirectoryGroup[]; total: number }>(
        `admin/groups?${new URLSearchParams({ search: term, page: String(page) })}`,
      ),
  });
  return (
    <section className="admin-panel" aria-label="All family groups">
      <h3>All family groups</h3>
      <p>
        Choose a group to manage its members, invitations and households.
        Managing a group does not join it or grant access to its gifts.
      </p>
      <Field label="Find a family group">
        <input
          ref={searchInput}
          type="search"
          maxLength={160}
          placeholder="Search group names"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Field>
      {query.isPending || term !== search.trim() ? (
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
          {!query.data.rows.length && (
            <p>
              {term
                ? "No matching family groups. Try another name."
                : "No family groups have been created yet."}
            </p>
          )}
          {query.data.rows.map((g) => (
            <div className="admin-directory-row" key={g.id}>
              <div>
                <h4>{g.name}</h4>
                <p className="muted">
                  {g.members.find((m) => m.userId === g.ownerId)?.name ??
                    "Primary owner"}{" "}
                  · {g.members.length}{" "}
                  {g.members.length === 1 ? "member" : "members"}
                  {g.requests.length
                    ? ` · ${g.requests.length} pending ${g.requests.length === 1 ? "request" : "requests"}`
                    : ""}
                </p>
              </div>
              <button
                className="button secondary"
                aria-label={`Manage ${g.name}`}
                onClick={(e) => {
                  lastTrigger.current = e.currentTarget;
                  position.current = window.scrollY;
                  setParams((current) => {
                    const next = new URLSearchParams(current);
                    next.set("adminGroup", g.id);
                    next.delete("adminTab");
                    return next;
                  });
                }}
              >
                Manage
              </button>
            </div>
          ))}
          {query.data.total > 24 && (
            <div className="actions">
              <button
                className="button secondary"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span>
                Page {page} of {Math.ceil(query.data.total / 24)}
              </span>
              <button
                className="button secondary"
                disabled={page * 24 >= query.data.total}
                onClick={() => setPage(page + 1)}
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
