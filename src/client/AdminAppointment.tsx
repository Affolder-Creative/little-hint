import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { useApp } from "./context";
import { Field } from "./components";
import { Confirm } from "./Confirm";

type Candidate = { id: string; name: string; email?: string; revision: number };

export function AppointAdministrator({
  person,
  onSaved,
}: {
  person: Candidate;
  onSaved?: () => void;
}) {
  const { mutate } = useApp();
  const cache = useQueryClient();
  return (
    <Confirm
      label="Make app admin"
      onConfirm={async () => {
        await mutate("admin/administrators", {
          id: person.id,
          revision: person.revision,
          admin: true,
        });
        await Promise.all(
          ["admin-profiles", "app-administrators", "admin-groups"].map((key) =>
            cache.invalidateQueries({ queryKey: [key] }),
          ),
        );
        onSaved?.();
      }}
    >
      {person.name}
      {person.email ? ` (${person.email})` : ""} will be able to manage this app
      and all family groups. Private content, gift surprises and secrets stay
      protected.
    </Confirm>
  );
}

export function AddAdministrator() {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const review = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected) review.current?.focus();
  }, [selected]);
  const { close } = useApp();
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useQuery({
    queryKey: ["admin-profiles", "eligible", term, page],
    enabled: !!term && term === search.trim(),
    queryFn: () =>
      api<{ rows: Candidate[]; total: number }>(
        `admin/profiles?${new URLSearchParams({ search: term, page: String(page), eligibleForAdmin: "true" })}`,
      ),
  });
  return selected ? (
    <div className="text-stack" ref={review} tabIndex={-1}>
      <button className="text-button" onClick={() => setSelected(null)}>
        Back to search
      </button>
      <AppointAdministrator person={selected} />
    </div>
  ) : (
    <div className="text-stack">
      <p>Choose someone who already has an account.</p>
      <Field label="Find an account">
        <input
          autoFocus
          type="search"
          maxLength={160}
          placeholder="Name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Field>
      {!!search.trim() &&
        (term !== search.trim() || query.isPending ? (
          <p role="status">Finding accounts…</p>
        ) : query.error ? (
          <p role="alert">
            Could not find accounts.{" "}
            <button className="text-button" onClick={() => query.refetch()}>
              Try again
            </button>
          </p>
        ) : (
          <>
            {query.data?.total === 0 && (
              <p>
                No matching accounts. Existing administrators and managed
                profiles aren't shown.
              </p>
            )}
            <div className="admin-profile-matches">
              {query.data?.rows.map((p) => (
                <button
                  key={p.id}
                  className="admin-profile-match"
                  onClick={() => setSelected(p)}
                >
                  <strong>{p.name}</strong>
                  <small>{p.email}</small>
                </button>
              ))}
            </div>
            {(query.data?.total ?? 0) > 24 && (
              <div className="actions">
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
        ))}
      <button className="button secondary" onClick={close}>
        Cancel
      </button>
    </div>
  );
}
