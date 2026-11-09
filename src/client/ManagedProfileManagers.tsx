import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Person } from "../shared/model";
import { useApp } from "./context";
import { api } from "./api";
import { Field } from "./components";
import { ChevronDown } from "lucide-react";
import { SearchSelect, SelectionTags } from "./SearchSelect";
import { Action } from "./Action";

type Member = { id: string; name: string };
type Details = {
  ownerId: string;
  managers: Member[];
  candidates: Member[];
  pending: { id: string; name: string }[];
};
export function ManagedProfileManagers({ person }: { person: Person }) {
  const { world, toast } = useApp();
  const client = useQueryClient();
  const details = useQuery({
    queryKey: ["profile-management", person.id, person.revision],
    queryFn: () => api<Details>(`people/${person.id}/management`),
  });
  const [selected, setSelected] = useState(person.guardians);
  const [search, setSearch] = useState("");
  const [transfer, setTransfer] = useState(false);
  const [target, setTarget] = useState("");
  const [keep, setKeep] = useState(true);
  const owner = (person.managedOwnerId ?? person.guardians[0]) === world.me.id;
  const data = details.data;
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ["profile-management"] });
    await client.invalidateQueries({ queryKey: ["account-closure"] });
  };
  return (
    <fieldset className="choice-group form-section profile-managers">
      <legend>Managers</legend>
      <p className="muted">
        Managers can edit this profile, wish lists and private gift preferences.
        Gift surprises stay protected. Only the owner can change managers.
      </p>
      {owner &&
        selected.map((id) => (
          <input key={id} type="hidden" name="managerUserIds" value={id} />
        ))}
      {!data ? (
        <p role={details.isError ? "alert" : "status"}>
          {details.isError ? (
            <>
              Managers could not be loaded.{" "}
              <button
                type="button"
                className="text-button"
                onClick={() => void details.refetch()}
              >
                Try again
              </button>
            </>
          ) : (
            "Loading managers…"
          )}
        </p>
      ) : (
        <>
          <p className="profile-owner">
            {data.managers.find((m) => m.id === data.ownerId)?.name ??
              "Profile owner"}
            {data.ownerId === world.me.id ? " · You" : ""}
            <small className="manager-role">Owner</small>
          </p>
          {!owner && (
            <div className="managed-group-choices">
              {data.managers
                .filter((m) => m.id !== data.ownerId)
                .map((m) => (
                  <p key={m.id}>
                    {m.name}
                    <small className="manager-role">Co-manager</small>
                  </p>
                ))}
            </div>
          )}
          {owner && (
            <>
              <SearchSelect
                label="Find users"
                value={search}
                onChange={setSearch}
                placeholder="Search connected people"
                multiple
                minSearchLength={1}
                selected={selected}
                choices={[
                  ...new Map(
                    [...data.managers, ...data.candidates].map((m) => [
                      m.id,
                      m,
                    ]),
                  ).values(),
                ]
                  .filter(
                    (m) =>
                      m.id !== data.ownerId &&
                      m.name.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((m) => ({ id: m.id, label: m.name }))}
                onChoose={(id) =>
                  setSelected((ids) =>
                    ids.includes(id)
                      ? ids.filter((v) => v !== id)
                      : [...ids, id],
                  )
                }
              />
              <SelectionTags
                choices={selected
                  .filter((id) => id !== data.ownerId)
                  .map((id) => ({
                    id,
                    label:
                      [...data.managers, ...data.candidates].find(
                        (m) => m.id === id,
                      )?.name ?? "Former member",
                  }))}
                onRemove={(id) =>
                  setSelected((ids) => ids.filter((v) => v !== id))
                }
              />
              <p className="muted">
                Save profile to apply manager changes. Access starts
                immediately.
              </p>
              {data.pending.map((p) => (
                <div key={p.id}>
                  <p>
                    Waiting for {p.name} to accept ownership in Settings →
                    Sign-in &amp; security. Requests expire after 24 hours.
                  </p>
                  <Action
                    secondary
                    onClick={async () => {
                      await api("account/handoff/respond", {
                        id: p.id,
                        accept: false,
                      });
                      await refresh();
                    }}
                  >
                    Cancel transfer
                  </Action>
                </div>
              ))}
              {!data.pending.length && (
                <>
                  <button
                    type="button"
                    className="button secondary transfer-disclosure"
                    onClick={() => setTransfer(!transfer)}
                    aria-expanded={transfer}
                  >
                    Transfer ownership{" "}
                    <ChevronDown size={16} aria-hidden="true" />
                  </button>
                  {transfer && (
                    <div className="ownership-fields">
                      <Field label="New owner">
                        <select
                          value={target}
                          onChange={(e) => setTarget(e.target.value)}
                        >
                          <option value="">Choose a connected person</option>
                          {data.candidates
                            .filter((m) => m.id !== world.me.id)
                            .map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                        </select>
                      </Field>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={keep}
                          onChange={(e) => setKeep(e.target.checked)}
                        />
                        Keep me as a co-manager
                      </label>
                      <p className="muted">
                        You remain the owner until they accept. This sends a
                        separate request; save any profile changes first.
                      </p>
                      <Action
                        secondary
                        disabled={!target}
                        onClick={async () => {
                          await api("account/handoff", {
                            kind: "guardian",
                            personId: person.id,
                            userId: target,
                            keepPreviousOwner: keep,
                          });
                          await refresh();
                          setTransfer(false);
                          toast("Ownership transfer requested.");
                        }}
                      >
                        Request ownership transfer
                      </Action>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </fieldset>
  );
}
