import { useState } from "react";
import { useApp } from "./context";

export function IdeaAudienceSummary({
  visibility,
  recipientIds,
  excludedUserIds = [],
}: {
  visibility: string;
  recipientIds: string[];
  excludedUserIds?: string[];
}) {
  const { world } = useApp();
  const [expanded, setExpanded] = useState(false);
  const recipients = new Set(
    world.people
      .filter((p) => recipientIds.includes(p.id))
      .map((p) => p.userId),
  );
  const names = [...new Set(excludedUserIds)]
    .filter((id) => !recipients.has(id))
    .map(
      (id) =>
        world.people.find((p) => p.userId === id)?.name ?? "Unavailable person",
    );
  if (visibility === "private") return <>Only you can see this idea.</>;
  if (visibility === "visible") return <>Recipients can see this idea.</>;
  const visibleNames = expanded ? names : names.slice(0, 3);
  const list =
    names.length > 3 && !expanded
      ? visibleNames.join(", ")
      : new Intl.ListFormat("en", {
          style: "long",
          type: "conjunction",
        }).format(visibleNames);
  return (
    <>
      Hidden from all recipients{names.length ? `, plus ${list}` : ""}
      {names.length > 3 && !expanded ? (
        <>
          {" "}
          <button
            type="button"
            className="text-button idea-exclusions-toggle"
            aria-expanded={false}
            onClick={() => setExpanded(true)}
          >
            and {names.length - 3} more
          </button>
        </>
      ) : (
        "."
      )}
      {names.length > 3 && expanded && (
        <button
          type="button"
          className="text-button idea-exclusions-toggle"
          aria-expanded={true}
          onClick={() => setExpanded(false)}
        >
          Show fewer
        </button>
      )}
    </>
  );
}
