import { Link } from "react-router-dom";
import type { Exchange, World } from "../shared/model";

type Plan = Pick<
  Exchange,
  | "participantIds"
  | "groupId"
  | "count"
  | "excludeHousehold"
  | "exclusions"
  | "previousId"
>;

export function participantLabel(world: World, id: string) {
  const person = world.people.find((p) => p.id === id);
  if (!person) return "Former member";
  return (
    person.name +
    (world.people.filter((p) => p.name === person.name).length > 1
      ? ` · ${id.slice(0, 8)}`
      : "")
  );
}

export function exchangeMissingLists(world: World, exchange: Plan) {
  return exchange.participantIds.filter(
    (id) =>
      !world.lists.some(
        (list) =>
          !list.archived &&
          list.mode === "surprise" &&
          list.ownerIds.includes(id) &&
          list.groupIds.includes(exchange.groupId),
      ),
  );
}

export function ExchangeReview({
  world,
  exchange,
}: {
  world: World;
  exchange: Plan;
}) {
  const missing = exchangeMissingLists(world, exchange);
  return (
    <section aria-label="Exchange review">
      <h3>Participants and rules</h3>
      <ul>
        {exchange.participantIds.map((id) => (
          <li key={id}>
            {world.people.some((p) => p.id === id) ? (
              <Link to={`/people/${id}`}>{participantLabel(world, id)}</Link>
            ) : (
              "Former member: edit participants before drawing"
            )}
            {missing.includes(id)
              ? " · Needs a wish list set to Keep it a surprise and shared with this group"
              : " · List ready"}
          </li>
        ))}
      </ul>
      <p>
        Each participant gives to {exchange.count}{" "}
        {exchange.count === 1 ? "person" : "people"}.{" "}
        {exchange.excludeHousehold
          ? "People sharing a household will not be matched."
          : "People in the same household may be matched."}
      </p>
      {exchange.exclusions.length > 0 ? (
        <ul>
          {exchange.exclusions.map(([from, to]) => (
            <li key={`${from}:${to}`}>
              {participantLabel(world, from)} will not give to{" "}
              {participantLabel(world, to)}.
            </li>
          ))}
        </ul>
      ) : (
        <p>No individual matches to avoid.</p>
      )}
      {exchange.previousId && (
        <p>
          Prefer different matches from{" "}
          {world.exchanges.find((e) => e.id === exchange.previousId)?.name ??
            "the previous exchange"}
          .
        </p>
      )}
      {missing.length > 0 && (
        <p className="notice">
          Ask the people marked above to share a wish list set to Keep it a
          surprise before you draw names. You can save this exchange and edit it
          while they get ready.
        </p>
      )}
    </section>
  );
}
