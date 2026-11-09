import { useState } from "react";
import type { Person } from "../shared/model";
import { useApp } from "./context";
import { SearchSelect, SelectionTags } from "./SearchSelect";
import { familyGroupLabel } from "../shared/households";

export function ManagedProfileSharing({ person }: { person?: Person }) {
  const { world } = useApp();
  const initial =
    person?.managedGroupIds ?? (person ? world.groups.map((g) => g.id) : []);
  const [enabled, setEnabled] = useState(initial.length > 0);
  const [groups, setGroups] = useState(initial);
  const [search, setSearch] = useState("");
  const selected = enabled
    ? groups.filter((id) => world.groups.some((g) => g.id === id))
    : [];
  const retained =
    person &&
    world.lists.filter(
      (l) =>
        l.ownerIds.includes(person.id) &&
        l.groupIds.some((id) => !selected.includes(id)),
    );
  return (
    <fieldset className="choice-group form-section profile-sharing">
      <legend>Family-group sharing</legend>
      <label className="check">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
            if (e.target.checked && !groups.length)
              setGroups(world.groups.map((g) => g.id));
          }}
        />
        Share with family groups
      </label>
      <p className="muted">
        Selected groups can find this profile and select it for events. New wish
        lists start with these groups selected. Gift ideas stay private until
        you share them.
      </p>
      {enabled && (
        <>
          {world.groups.length ? (
            <>
              <SearchSelect
                label="Find family groups"
                value={search}
                onChange={setSearch}
                placeholder="Search family groups"
                multiple
                minSearchLength={1}
                optionKind="group"
                selected={groups}
                choices={world.groups
                  .filter((g) =>
                    g.name.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((g) => ({
                    id: g.id,
                    label: familyGroupLabel(g, world),
                  }))}
                onChoose={(id) =>
                  setGroups((ids) =>
                    ids.includes(id)
                      ? ids.filter((v) => v !== id)
                      : [...ids, id],
                  )
                }
              />
              <SelectionTags
                choices={world.groups
                  .filter((g) => groups.includes(g.id))
                  .map((g) => ({
                    id: g.id,
                    label: familyGroupLabel(g, world),
                  }))}
                onRemove={(id) =>
                  setGroups((ids) => ids.filter((v) => v !== id))
                }
              />
            </>
          ) : (
            <p>
              You do not belong to any family groups yet. You can share this
              profile later.
            </p>
          )}
        </>
      )}
      {selected.map((id) => (
        <input key={id} type="hidden" name="managedGroupIds" value={id} />
      ))}
      {!!retained?.length && (
        <p className="notice">
          Existing lists keep their own sharing:{" "}
          {retained.map((l) => l.name).join(", ")}. Event lists may be archived
          if this person is no longer eligible. Review each list to change its
          audience.
        </p>
      )}
    </fieldset>
  );
}
