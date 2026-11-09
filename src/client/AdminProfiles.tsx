import { AdminAccountDeletion } from "./AdminAccountDeletion";
import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { useApp } from "./context";
import { Field, Form } from "./components";
type Profile = {
  id: string;
  revision: number;
  name: string;
  userId?: string;
  email?: string;
  admin: boolean;
  managed: boolean;
};
export function AdminProfiles() {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<Profile | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const detail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected) detail.current?.focus();
  }, [selected?.id]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const [page, setPage] = useState(1);
  const { world, open, close, toast } = useApp();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["admin-profiles", term, page],
    enabled: !!term && term === search.trim(),
    queryFn: () =>
      api<{ rows: Profile[]; total: number }>(
        `admin/profiles?${new URLSearchParams({ search: term, page: String(page) })}`,
      ),
  });
  useEffect(() => {
    if (query.data && page > Math.max(1, Math.ceil(query.data.total / 24)))
      setPage(Math.max(1, Math.ceil(query.data.total / 24)));
  }, [query.data, page]);
  return (
    <section className="admin-panel" aria-label="Users and profiles">
      <h3>Users &amp; profiles</h3>
      <p>Find someone to edit their name or manage their account.</p>
      <Field label="Find a user or profile">
        <input
          ref={searchInput}
          type="search"
          maxLength={160}
          placeholder="Search by name or email"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setSelected(null);
            setPage(1);
          }}
        />
      </Field>
      {!search.trim() ? (
        <p className="muted">
          Start typing a name or email to find a user or profile.
        </p>
      ) : term !== search.trim() || query.isPending ? (
        <p role="status">Loading profiles…</p>
      ) : query.error ? (
        <p role="alert">
          Could not load profiles.{" "}
          <button className="text-button" onClick={() => query.refetch()}>
            Try again
          </button>
        </p>
      ) : selected ? null : (
        <>
          <div
            className="admin-profile-matches"
            aria-label="Matching users and profiles"
          >
            {query.data?.rows.map((p) => (
              <button
                className="admin-profile-match"
                key={p.id}
                onClick={() => setSelected(p)}
              >
                <strong>{p.name}</strong>
                <small>
                  {p.managed ? "Managed profile" : p.email}
                  {p.admin ? " · Administrator" : ""}
                </small>
              </button>
            ))}
          </div>
          {query.data?.total === 0 && <p>No matching profiles.</p>}
          {(query.data?.total ?? 0) > 24 && (
            <div className="invitation-actions">
              <button
                className="button secondary"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span>Page {page}</span>
              <button
                className="button secondary"
                disabled={page * 24 >= query.data!.total}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
      {selected && (
        <div
          className="admin-profile-detail"
          ref={detail}
          tabIndex={-1}
          role="region"
          aria-label="Selected profile"
        >
          <button
            className="text-button"
            onClick={() => {
              setSelected(null);
              searchInput.current?.focus();
            }}
          >
            Back to results
          </button>
          <div>
            <strong>{selected.name}</strong>
            <p>
              {selected.managed ? "Managed profile" : selected.email}
              {selected.admin ? " · Administrator" : ""}
            </p>
          </div>
          <div className="invitation-actions">
            <button
              className="button secondary"
              aria-label={`Edit name for ${selected.name}`}
              onClick={() =>
                open(
                  "Edit profile name",
                  <Form
                    submit="Save name"
                    onSubmit={async (data) => {
                      const updated = await api<
                        Pick<Profile, "id" | "name" | "revision">
                      >("admin/profiles/update", {
                        id: selected.id,
                        revision: selected.revision,
                        name: data.get("name"),
                      });
                      setSelected((previous) =>
                        previous?.id === selected.id
                          ? { ...previous, ...updated }
                          : previous,
                      );
                      await Promise.all([
                        client.invalidateQueries({
                          queryKey: ["admin-profiles"],
                        }),
                        client.invalidateQueries({ queryKey: ["world"] }),
                      ]);
                      close();
                      toast("Profile name saved.");
                    }}
                  >
                    <Field label="Name">
                      <input
                        name="name"
                        defaultValue={selected.name}
                        required
                        maxLength={160}
                      />
                    </Field>
                  </Form>,
                )
              }
            >
              Edit name
            </button>
            {selected.userId && selected.userId !== world.me.id && (
              <button
                className="text-button danger"
                onClick={() =>
                  open(
                    "Delete account",
                    <AdminAccountDeletion
                      userId={selected.userId!}
                      name={selected.name}
                      onDeleted={() => setSelected(null)}
                    />,
                  )
                }
              >
                Delete account
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
