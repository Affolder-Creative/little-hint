import { AdminAccountDeletion } from "./AdminAccountDeletion";
import { useState, useEffect } from "react";
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
  const [page, setPage] = useState(1);
  const { world, open, close, toast } = useApp();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["admin-profiles", search, page],
    queryFn: () =>
      api<{ rows: Profile[]; total: number }>(
        `admin/profiles?${new URLSearchParams({ search, page: String(page) })}`,
      ),
  });
  useEffect(() => {
    if (query.data && page > Math.max(1, Math.ceil(query.data.total / 24)))
      setPage(Math.max(1, Math.ceil(query.data.total / 24)));
  }, [query.data, page]);
  return (
    <section className="admin-panel" aria-label="Users and profiles">
      <h3>Users &amp; profiles</h3>
      <p>Edit the name people see in Little Hint.</p>
      <Field label="Find a user or profile">
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
        <p role="status">Loading profiles…</p>
      ) : query.error ? (
        <p role="alert">
          Could not load profiles.{" "}
          <button className="text-button" onClick={() => query.refetch()}>
            Try again
          </button>
        </p>
      ) : (
        <>
          {query.data?.rows.map((p) => (
            <div className="invitation-row" key={p.id}>
              <div>
                <strong>{p.name}</strong>
                <p>
                  {p.managed ? "Managed profile" : p.email}
                  {p.admin ? " · Administrator" : ""}
                </p>
              </div>
              <div className="invitation-actions">
                <button
                  className="button secondary"
                  aria-label={`Edit name for ${p.name}`}
                  onClick={() =>
                    open(
                      "Edit profile name",
                      <Form
                        submit="Save name"
                        onSubmit={async (data) => {
                          await api("admin/profiles/update", {
                            id: p.id,
                            revision: p.revision,
                            name: data.get("name"),
                          });
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
                            defaultValue={p.name}
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
                {p.userId && p.userId !== world.me.id && (
                  <button
                    className="text-button danger"
                    onClick={() =>
                      open(
                        "Delete account",
                        <AdminAccountDeletion
                          userId={p.userId!}
                          name={p.name}
                        />,
                      )
                    }
                  >
                    Delete account
                  </button>
                )}
              </div>
            </div>
          ))}
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
    </section>
  );
}
