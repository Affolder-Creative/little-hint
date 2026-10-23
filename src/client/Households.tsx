import { useState } from "react";
import { Plus } from "lucide-react";
import type { Group, Household } from "../shared/model";
import { peopleForGroup } from "../shared/group-events";
import { householdLabel } from "../shared/households";
import { useApp } from "./context";
import { Field, Form } from "./components";
import { Confirm } from "./Confirm";

function HouseholdForm({
  group,
  household,
}: {
  group: Group;
  household?: Household;
}) {
  const { mutate, close } = useApp();
  return (
    <Form
      submit={household ? "Save household" : "Create household"}
      onSubmit={async (data) => {
        await mutate(household ? "households/update" : "households", {
          ...(household
            ? { id: household.id, revision: household.revision }
            : { groupId: group.id }),
          name: String(data.get("name") ?? ""),
        });
        close();
      }}
    >
      <Field
        label="Household name"
        hint="Names do not need to be unique. Members help distinguish households with the same name."
      >
        <input
          name="name"
          required
          maxLength={160}
          defaultValue={household?.name}
          placeholder="The Smiths"
        />
      </Field>
      <p className="muted">
        For {group.name}. Renaming keeps memberships and future exchange
        exclusions intact.
      </p>
    </Form>
  );
}

function MembershipForm({
  group,
  personId,
}: {
  group: Group;
  personId: string;
}) {
  const { world, mutate, close } = useApp();
  const person = world.people.find((p) => p.id === personId)!;
  const households = world.households.filter((h) => h.groupId === group.id);
  const [revision] = useState(person.revision);
  // Keep the revision paired with the form's initial selections. Concurrent edits
  // must be reviewed, rather than overwriting another person's newer choices.
  return (
    <Form
      submit="Save households"
      onSubmit={async (data) => {
        await mutate("households/memberships", {
          groupId: group.id,
          personId,
          revision: Number(data.get("revision")),
          householdIds: data.getAll("householdIds").map(String),
        });
        close();
      }}
    >
      <input type="hidden" name="revision" value={revision} />
      <fieldset className="choice-group">
        <legend>
          Households for {person.name} in {group.name}
        </legend>
        {households.map((h) => (
          <label className="check" key={h.id}>
            <input
              type="checkbox"
              name="householdIds"
              value={h.id}
              defaultChecked={world.householdMemberships.some(
                (m) => m.householdId === h.id && m.personId === personId,
              )}
            />
            {householdLabel(h, world)}
          </label>
        ))}
      </fieldset>
      <p className="muted">
        Choose any number, or leave all unchecked. These choices only affect
        future drawings that avoid household matches. They do not change list
        access.
      </p>
    </Form>
  );
}

export function HouseholdSettings({ group }: { group: Group }) {
  const { world, mutate, open } = useApp();
  const owner = group.ownerId === world.me.id;
  const households = world.households.filter((h) => h.groupId === group.id);
  const people = peopleForGroup(world.people, group);
  return (
    <section
      className="household-settings"
      aria-label={`Households in ${group.name}`}
    >
      <div className="section-heading">
        <h4>Households</h4>
        {owner && (
          <button
            className="text-button"
            onClick={() =>
              open("Create a household", <HouseholdForm group={group} />)
            }
          >
            <Plus size={16} />
            Create household
          </button>
        )}
      </div>
      <p className="muted">
        Optional: organize people for household exclusions in gift exchanges.
        Family-group membership controls invitations and shared-list access. A
        person can belong to more than one household.
      </p>
      {!households.length && (
        <p className="muted">
          No households yet.{" "}
          {owner
            ? "Create one to get started."
            : "The family-group owner can create households, then you can choose yours."}
        </p>
      )}
      {households.map((h) => (
        <div className="setting-row" key={h.id}>
          <div>
            <strong>{h.name}</strong>
            <p>{householdLabel(h, world, false)}</p>
          </div>
          {owner && (
            <div className="actions">
              <button
                className="text-button"
                aria-label={`Rename ${householdLabel(h, world)}`}
                onClick={() =>
                  open(
                    "Rename household",
                    <HouseholdForm group={group} household={h} />,
                  )
                }
              >
                Rename
              </button>
              <button
                className="text-button"
                aria-label={`Delete ${householdLabel(h, world)}`}
                onClick={() =>
                  open(
                    "Delete household?",
                    <Confirm
                      label="Delete household"
                      onConfirm={() =>
                        mutate("households/delete", {
                          id: h.id,
                          revision: h.revision,
                        })
                      }
                    >
                      Remove {h.name} and its household memberships? People,
                      family-group membership, lists, and completed drawings
                      will stay intact. Future drawings will use the remaining
                      households.
                    </Confirm>,
                  )
                }
              >
                Delete
              </button>
            </div>
          )}
        </div>
      ))}
      {!!households.length && (
        <>
          <h5>People and memberships</h5>
          {people.map((p) => {
            const theirs = households.filter((h) =>
              world.householdMemberships.some(
                (m) => m.personId === p.id && m.householdId === h.id,
              ),
            );
            return (
              <div className="setting-row" key={p.id}>
                <div>
                  <strong>{p.name}</strong>
                  <p>
                    {theirs.length
                      ? theirs
                          .map((h) =>
                            households.some(
                              (other) =>
                                other.id !== h.id && other.name === h.name,
                            )
                              ? `${h.name} · ${h.id.slice(0, 8)}`
                              : h.name,
                          )
                          .join("; ")
                      : "No household"}
                  </p>
                </div>
                {(owner ||
                  p.userId === world.me.id ||
                  p.guardians.includes(world.me.id)) && (
                  <button
                    className="text-button"
                    aria-label={`Choose households for ${p.name}`}
                    onClick={() =>
                      open(
                        `Households for ${p.name}`,
                        <MembershipForm group={group} personId={p.id} />,
                      )
                    }
                  >
                    Choose households
                  </button>
                )}
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}
