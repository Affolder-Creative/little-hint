import { useState } from "react";
import { useApp } from "./context";
import { SearchSelect, SelectionTags } from "./SearchSelect";

export function IdeaPeople({
  label,
  selected,
  onChange,
  groups,
  recipients = [],
  disabled = false,
}: {
  label: string;
  selected: string[];
  onChange: (ids: string[]) => void;
  groups?: string[];
  recipients?: string[];
  disabled?: boolean;
}) {
  const { world } = useApp();
  const [query, setQuery] = useState("");
  const exclusions = groups !== undefined;
  const hasFriend = selected.some((id) =>
    world.friendEntries?.some((f) => f.personId === id && !f.connectedAt),
  );
  const choices = world.people
    .filter((p) => p.userId !== world.me.id)
    .map((p) => ({
      id: exclusions ? (p.userId ?? "") : p.id,
      label: p.name,
      detail: world.groups
        .filter((g) => p.userId && g.memberIds.includes(p.userId))
        .map((g) => g.name)
        .join(", "),
      eligible: exclusions
        ? !!p.userId &&
          !recipients.includes(p.id) &&
          world.groups.some(
            (g) => groups.includes(g.id) && g.memberIds.includes(p.userId!),
          )
        : selected.length < 20 &&
          !hasFriend &&
          (!selected.length ||
            !world.friendEntries?.some(
              (f) => f.personId === p.id && !f.connectedAt,
            )),
    }))
    .filter((p) => p.id);
  const selectedChoices = selected.map((id) =>
    (() => {
      const person = choices.find((p) => p.id === id);
      if (!person) return { id, label: "Unavailable person" };
      return exclusions && !person.eligible
        ? { ...person, label: `${person.label} (still excluded)` }
        : person;
    })(),
  );
  return (
    <div className="text-stack idea-people">
      {disabled ? (
        <p>
          {label}: {selectedChoices.map((p) => p.label).join(" & ")}
          <br />
          <small>Recipients can no longer be changed for this idea.</small>
        </p>
      ) : (
        <>
          <SearchSelect
            label={label}
            value={query}
            onChange={setQuery}
            multiple
            minSearchLength={1}
            placeholder="Search by name"
            selected={selected}
            choices={choices
              .filter(
                (p) =>
                  p.eligible &&
                  !selected.includes(p.id) &&
                  p.label
                    .toLocaleLowerCase()
                    .includes(query.trim().toLocaleLowerCase()),
              )
              .slice(0, 20)}
            onChoose={(id) => {
              onChange([...selected, id]);
              setQuery("");
            }}
            hint={
              exclusions
                ? "Recipients are automatically excluded. Choose other people from the selected family groups."
                : "Choose one or more people. Unconnected friends need their own gift idea."
            }
          />
          <SelectionTags
            choices={selectedChoices}
            onRemove={(id) => onChange(selected.filter((v) => v !== id))}
          />
        </>
      )}
    </div>
  );
}
