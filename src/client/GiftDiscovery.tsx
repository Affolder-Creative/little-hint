import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, Shuffle } from "lucide-react";
import { api, dollars } from "./api";
import { Field, Form, Header } from "./components";
import { useApp } from "./context";
import { InterestFields } from "./GiftPreferences";
import {
  discoveryAllowed,
  type DiscoveryContext,
  type DiscoveryInput,
  type DiscoverySelection,
  type GiftCandidate,
  type GiftDiscoveryJob,
} from "../shared/gift-discovery";

export function GiftDiscoveryPage() {
  const { id = "" } = useParams();
  const { world } = useApp();
  const person = world.people.find((p) => p.id === id);
  const permitted =
    person &&
    world.giftDiscovery &&
    discoveryAllowed(
      world.giftDiscovery,
      person.userId === world.me.id || person.guardians.includes(world.me.id),
    );
  const context = useQuery({
    queryKey: ["gift-discovery-context", world.me.id, id],
    queryFn: () => api<DiscoveryContext>(`gift-discovery/context/${id}`),
    enabled: !!permitted,
    retry: false,
    refetchInterval: 20000,
  });
  if (!permitted)
    return (
      <>
        <h1>Gift suggestions are unavailable</h1>
        <p>
          This feature is not enabled for this person. You can still add gift
          ideas manually.
        </p>
        <Link to={`/people/${id}`}>Back to profile</Link>
      </>
    );
  if (context.error)
    return (
      <>
        <h1>Gift suggestions are unavailable</h1>
        <p role="alert">{context.error.message}</p>
        <button className="button secondary" onClick={() => context.refetch()}>
          Retry
        </button>
      </>
    );
  if (!context.data) return <p role="status">Loading gift preferences…</p>;
  return (
    <DiscoveryFlow
      key={`${world.me.id}:${id}`}
      context={context.data}
      name={person.name}
      personId={id}
    />
  );
}
function DiscoveryFlow({
  context,
  name,
  personId,
}: {
  context: DiscoveryContext;
  name: string;
  personId: string;
}) {
  const { world, toast } = useApp();
  const client = useQueryClient();
  const [params] = useSearchParams();
  const lists = world.lists.filter(
    (l) => l.canEdit && !l.archived && l.ownerIds.includes(personId),
  );
  const [defaultList, setDefaultList] = useState(
    lists.find((l) => l.id === params.get("list"))?.id ?? lists[0]?.id ?? "",
  );
  const recent = context.recent;
  const prefs = context.preferences;
  const [input, setInput] = useState<DiscoveryInput>(
    recent?.input ?? {
      personId,
      categoryIds: prefs?.categoryIds ?? context.inferredCategoryIds,
      interests: prefs?.interests ?? "",
      likes: prefs?.likes ?? "",
      avoid: prefs?.avoid ?? "",
      maxPriceCents: null,
    },
  );
  const [price, setPrice] = useState(
    recent?.input.maxPriceCents ? String(recent.input.maxPriceCents / 100) : "",
  );
  const [jobId, setJobId] = useState(recent?.id ?? "");
  const [selected, setSelected] = useState<Record<string, DiscoverySelection>>(
    () =>
      Object.fromEntries(
        (recent?.review?.selections ?? recent?.requestedSelections ?? []).map(
          (s) => [s.candidateId, s],
        ),
      ),
  );
  const [page, setPage] = useState(0);
  const [phase, setPhase] = useState<"select" | "review">("select");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const operation = useRef<{ signature: string; key: string } | null>(null);
  const jobQuery = useQuery({
    queryKey: ["gift-discovery-job", world.me.id, jobId],
    queryFn: () => api<GiftDiscoveryJob>(`gift-discovery/${jobId}`),
    enabled: !!jobId,
    initialData: recent?.id === jobId ? recent : undefined,
    retry: false,
    refetchInterval: (q) =>
      q.state.error
        ? false
        : ["pending", "running", "reviewing"].includes(
              q.state.data?.status ?? "",
            )
          ? 2000
          : 20000,
    refetchIntervalInBackground: false,
  });
  const job = jobQuery.data;
  const working =
    !!job && ["pending", "running", "reviewing"].includes(job.status);
  useEffect(() => {
    if (job?.review && !job.review.conflicts.length) setPhase("review");
  }, [job?.review?.id]);
  useEffect(() => {
    if (phase === "review") reviewHeading.current?.focus();
  }, [phase]);
  async function send(path: string, body: unknown) {
    const signature = JSON.stringify([path, body]);
    if (operation.current?.signature !== signature)
      operation.current = { signature, key: crypto.randomUUID() };
    const result = await api<any>(path, body, {
      idempotencyKey: operation.current.key,
    });
    operation.current = null;
    return result;
  }
  function putJob(next: GiftDiscoveryJob) {
    client.setQueryData(["gift-discovery-job", world.me.id, next.id], next);
    setJobId(next.id);
    void client.invalidateQueries({
      queryKey: ["gift-discovery-context", world.me.id, personId],
    });
  }
  async function search() {
    setError("");
    const maximum = price ? Math.round(Number(price) * 100) : null;
    if (maximum !== null && (!Number.isFinite(maximum) || maximum <= 0))
      throw new Error("Enter a positive maximum price.");
    const result = await send("gift-discovery", {
      ...input,
      maxPriceCents: maximum,
      fresh: !!jobId,
    });
    const next = result.replayed
      ? await api<GiftDiscoveryJob>(`gift-discovery/${result.jobId}`)
      : result;
    putJob(next);
    setSelected({});
    setPage(0);
    setPhase("select");
  }
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function toggle(candidate: GiftCandidate, checked: boolean) {
    setSelected((current) => {
      const next = { ...current };
      if (!checked) delete next[candidate.id];
      else
        next[candidate.id] = {
          candidateId: candidate.id,
          title: candidate.title,
          description: candidate.description,
          offerUrl: candidate.offers[0].url,
          ...(context.own ? { listId: defaultList } : {}),
          visibility: "private",
          groupIds: [],
          allowDuplicate: false,
        };
      return next;
    });
  }
  function change(id: string, fields: Partial<DiscoverySelection>) {
    setSelected((v) => ({ ...v, [id]: { ...v[id], ...fields } }));
  }
  const noAllowance =
    context.allowance.weeklyRemaining <= 0 ||
    context.allowance.monthlyRemaining <= 0;
  const visible = job?.candidates.slice(page * 6, page * 6 + 6) ?? [];
  const count = Object.keys(selected).length;
  return (
    <div className="gift-discovery-page">
      <Link className="back-link" to={`/people/${personId}`}>
        <ArrowLeft size={16} />
        {name}
      </Link>
      <Header
        title={`Find gift ideas for ${name}`}
        description="Start with their interests, then choose what to save."
      />
      {jobQuery.error && (
        <div role="alert">
          <p>{jobQuery.error.message}</p>
          <button
            className="button secondary"
            onClick={() => jobQuery.refetch()}
          >
            Retry status
          </button>
          <button className="text-button" onClick={() => setPhase("select")}>
            Back to selection
          </button>
        </div>
      )}
      {phase === "select" && (
        <>
          <details className="discovery-search" open={!jobId}>
            <summary>Interests and price limit</summary>
            {!prefs && context.inferredCategoryIds.length > 0 && (
              <p>
                These starting interests come from wish-list titles and tags you
                can see. Review them before searching. They will not change this
                person's profile.
              </p>
            )}
            <Form
              submit={
                jobId
                  ? `Search for new ideas · ${context.allowance.weeklyRemaining} left this week`
                  : "Find gift ideas"
              }
              disabled={working || noAllowance}
              onSubmit={search}
            >
              <InterestFields
                value={input}
                onChange={(v) => setInput({ ...input, ...v })}
              />
              <Field
                label={`Maximum price per gift${context.own ? " (optional)" : ""}`}
                hint="USD, before tax and shipping. Prices can change at checkout."
              >
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  max="1000000"
                  required={!context.own}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  inputMode="decimal"
                />
              </Field>
              {context.own && !price && (
                <p>
                  Without a maximum, look for a mix below $25, $25–$50,
                  $50–$100, and $100–$200.
                </p>
              )}
              <p className="muted">
                Searching sends these interests and notes to the configured AI
                service. It uses one search allowance. Choosing interests,
                browsing results, and shuffling do not use AI.
              </p>
            </Form>
          </details>
          <p className="muted">
            {context.allowance.weeklyRemaining} new searches left this week.
            Resets {new Date(context.allowance.weekResetsAt).toLocaleString()}.
          </p>
          {noAllowance && (
            <p role="status">
              {context.allowance.monthlyRemaining === 0
                ? `The app's monthly allowance is used. It resets ${new Date(context.allowance.monthResetsAt).toLocaleString()}.`
                : "Your weekly allowance is used."}{" "}
              You can still browse available recent results.
            </p>
          )}
          {working && (
            <p role="status">
              {job?.status === "reviewing"
                ? "Checking current prices before review…"
                : "Finding products and checking their evidence. This can take a few minutes…"}
            </p>
          )}
          {job && !jobQuery.error && !working && (
            <>
              {job.error && <p role="alert">{job.error}</p>}
              {job.status === "complete" && (
                <>
                  <h2>Ideas to consider</h2>
                  <p>
                    Results for{" "}
                    {job.input.maxPriceCents
                      ? `${dollars(job.input.maxPriceCents)} or less per gift`
                      : "a mix of prices up to $200"}
                    . Unsaved results expire{" "}
                    {new Date(job.expiresAt).toLocaleString()}.
                  </p>
                  {!job.candidates.length && (
                    <p>
                      We could not verify products matching this search. Try a
                      broader interest or another price limit, or add a gift
                      idea manually.
                    </p>
                  )}
                  <div className="discovery-results">
                    {visible.map((candidate) => (
                      <article className="discovery-product" key={candidate.id}>
                        {candidate.image && (
                          <img
                            src={`${candidate.image}?size=card`}
                            alt=""
                            loading="lazy"
                          />
                        )}
                        <h3>{candidate.title}</h3>
                        <p>{candidate.reason}</p>
                        <OfferLinks candidate={candidate} />
                        {candidate.evidence.map((e, i) => (
                          <p className="muted" key={i}>
                            <a
                              href={e.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {e.label}
                            </a>
                          </p>
                        ))}
                        {!candidate.offers.length ? (
                          <p>
                            This offer could not be refreshed. Remove it from
                            your selection.
                          </p>
                        ) : (
                          <label className="check">
                            <input
                              type="checkbox"
                              checked={!!selected[candidate.id]}
                              disabled={!!job.saved?.[candidate.id]}
                              onChange={(e) =>
                                toggle(candidate, e.target.checked)
                              }
                            />
                            {job.saved?.[candidate.id]
                              ? "Already saved"
                              : `Select ${candidate.title}`}
                          </label>
                        )}
                      </article>
                    ))}
                  </div>
                  {job.candidates.length > 6 && (
                    <button
                      className="button secondary"
                      onClick={() =>
                        setPage(
                          (p) => (p + 1) % Math.ceil(job.candidates.length / 6),
                        )
                      }
                    >
                      <Shuffle size={16} />
                      {page + 1 < Math.ceil(job.candidates.length / 6)
                        ? "Show different ideas"
                        : "Show earlier ideas"}
                    </button>
                  )}
                  {!!job.candidates.length && (
                    <p className="muted">
                      {job.candidates.length <= 6 ||
                      page + 1 === Math.ceil(job.candidates.length / 6)
                        ? "All ideas in this batch have been shown. "
                        : ""}
                      Shuffling uses this batch only and is free.
                    </p>
                  )}
                  {count > 0 && (
                    <section
                      className="discovery-selection"
                      aria-label="Selected gifts"
                    >
                      <h2>Your selection · {count}</h2>
                      {context.own && (
                        <Field label="Default wish list">
                          <select
                            value={defaultList}
                            onChange={(e) => {
                              setDefaultList(e.target.value);
                              setSelected((v) =>
                                Object.fromEntries(
                                  Object.entries(v).map(([id, item]) => [
                                    id,
                                    { ...item, listId: e.target.value },
                                  ]),
                                ),
                              );
                            }}
                          >
                            <option value="">Choose a wish list</option>
                            {lists.map((l) => (
                              <option value={l.id} key={l.id}>
                                {l.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                      )}
                      {context.own && !lists.length && (
                        <p>
                          Create an active wish list for this person before
                          saving. <Link to="/lists">Go to My lists</Link>
                        </p>
                      )}
                      {Object.values(selected).map((selection) => {
                        const candidate = job.candidates.find(
                          (c) => c.id === selection.candidateId,
                        )!;
                        const conflict = job.review?.conflicts.find(
                          (c) => c.candidateId === selection.candidateId,
                        );
                        return (
                          <div
                            className="discovery-selected-item"
                            key={selection.candidateId}
                          >
                            <h3>{candidate.title}</h3>
                            <Field label="Item name">
                              <input
                                maxLength={160}
                                value={selection.title}
                                onChange={(e) =>
                                  change(candidate.id, {
                                    title: e.target.value,
                                  })
                                }
                              />
                            </Field>
                            <Field label="Item notes">
                              <textarea
                                maxLength={5000}
                                value={selection.description}
                                onChange={(e) =>
                                  change(candidate.id, {
                                    description: e.target.value,
                                  })
                                }
                              />
                            </Field>
                            <Field label="Primary shop">
                              <select
                                value={selection.offerUrl}
                                onChange={(e) =>
                                  change(candidate.id, {
                                    offerUrl: e.target.value,
                                  })
                                }
                              >
                                {!candidate.offers.some(
                                  (o) => o.url === selection.offerUrl,
                                ) && (
                                  <option value={selection.offerUrl}>
                                    Previous offer unavailable
                                  </option>
                                )}
                                {candidate.offers.map((o) => (
                                  <option key={o.url} value={o.url}>
                                    {o.retailer} · {dollars(o.priceCents)}
                                  </option>
                                ))}
                              </select>
                            </Field>
                            {context.own ? (
                              <Field label="Save to wish list">
                                <select
                                  value={selection.listId ?? ""}
                                  onChange={(e) =>
                                    change(candidate.id, {
                                      listId: e.target.value,
                                    })
                                  }
                                >
                                  <option value="">Choose a wish list</option>
                                  {lists.map((l) => (
                                    <option key={l.id} value={l.id}>
                                      {l.name}
                                    </option>
                                  ))}
                                </select>
                              </Field>
                            ) : (
                              <>
                                <Field label="Who can see this gift idea?">
                                  <select
                                    value={selection.visibility}
                                    onChange={(e) =>
                                      change(candidate.id, {
                                        visibility: e.target
                                          .value as DiscoverySelection["visibility"],
                                        groupIds: [],
                                      })
                                    }
                                  >
                                    <option value="private">Only me</option>
                                    <option value="hidden">
                                      Selected groups, hidden from recipient
                                    </option>
                                    <option value="visible">
                                      Selected groups and recipient
                                    </option>
                                  </select>
                                </Field>
                                {selection.visibility !== "private" && (
                                  <fieldset className="gift-interests">
                                    <legend>Share with family groups</legend>
                                    {world.groups.map((g) => (
                                      <label className="check" key={g.id}>
                                        <input
                                          type="checkbox"
                                          checked={selection.groupIds.includes(
                                            g.id,
                                          )}
                                          onChange={(e) =>
                                            change(candidate.id, {
                                              groupIds: e.target.checked
                                                ? [...selection.groupIds, g.id]
                                                : selection.groupIds.filter(
                                                    (id) => id !== g.id,
                                                  ),
                                            })
                                          }
                                        />
                                        {g.name}
                                      </label>
                                    ))}
                                  </fieldset>
                                )}
                              </>
                            )}
                            {conflict && (
                              <div className="notice">
                                <p>
                                  A visible gift may match:{" "}
                                  <Link to={`/gift/${conflict.itemId}`}>
                                    {conflict.title}
                                  </Link>
                                  .
                                </p>
                                <label className="check">
                                  <input
                                    type="checkbox"
                                    checked={selection.allowDuplicate}
                                    onChange={(e) =>
                                      change(candidate.id, {
                                        allowDuplicate: e.target.checked,
                                      })
                                    }
                                  />
                                  Create a separate entry anyway
                                </label>
                              </div>
                            )}
                            <button
                              className="text-button"
                              onClick={() => toggle(candidate, false)}
                            >
                              Remove from selection
                            </button>
                          </div>
                        );
                      })}
                      <button
                        className="button"
                        disabled={busy || working}
                        onClick={() =>
                          perform(async () => {
                            const result = await send(
                              `gift-discovery/${job.id}/review`,
                              Object.values(selected),
                            );
                            putJob(
                              result.replayed
                                ? await api(`gift-discovery/${job.id}`)
                                : result,
                            );
                          })
                        }
                      >
                        Review {count} {count === 1 ? "gift" : "gifts"}
                      </button>
                    </section>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
      {phase === "review" && job?.review && !jobQuery.error && (
        <section className="discovery-review">
          <h2 ref={reviewHeading} tabIndex={-1}>
            Confirm your gifts
          </h2>
          <p>
            Nothing has been added yet. Check the destinations and who can see
            each item.
          </p>
          {job.review.selections.map((selection) => {
            const candidate = job.candidates.find(
              (c) => c.id === selection.candidateId,
            )!;
            const offer = candidate.offers.find(
              (o) => o.url === selection.offerUrl,
            )!;
            const list = lists.find((l) => l.id === selection.listId);
            return (
              <div
                className="discovery-selected-item"
                key={selection.candidateId}
              >
                <h3>{selection.title}</h3>
                <p>
                  {dollars(offer.priceCents)} at {offer.retailer}
                </p>
                {list ? (
                  <>
                    <p>Wish list: {list.name}</p>
                    <p>
                      For{" "}
                      {list.ownerIds
                        .map(
                          (id) =>
                            world.people.find((p) => p.id === id)?.name ??
                            "List owner",
                        )
                        .join(", ")}
                    </p>
                    <p>
                      {list.groupIds.length
                        ? `Shared with ${world.groups
                            .filter((g) => list.groupIds.includes(g.id))
                            .map((g) => g.name)
                            .join(", ")}`
                        : "Private to the list owners"}
                      .{" "}
                      {list.mode === "surprise"
                        ? "Keep it a surprise"
                        : "See the plans"}
                      .
                    </p>
                  </>
                ) : (
                  <p>
                    Gift idea for {name}.{" "}
                    {selection.visibility === "private"
                      ? "Only you can see this idea."
                      : `Shared with ${world.groups
                          .filter((g) => selection.groupIds.includes(g.id))
                          .map((g) => g.name)
                          .join(
                            ", ",
                          )}; ${selection.visibility === "hidden" ? "hidden from" : "visible to"} the recipient.`}
                  </p>
                )}
                {selection.allowDuplicate && (
                  <p>
                    A separate entry will be created, with its own reservations.
                  </p>
                )}
              </div>
            );
          })}
          <p className="muted">
            Amounts exclude tax and shipping. Saving does not reserve or buy
            these gifts.
          </p>
          <button
            className="button"
            disabled={busy}
            onClick={() =>
              perform(async () => {
                await send(`gift-discovery/${job.id}/save`, {
                  reviewId: job.review!.id,
                });
                await client.invalidateQueries({ queryKey: ["world"] });
                const latest = await api<GiftDiscoveryJob>(
                  `gift-discovery/${job.id}`,
                );
                putJob(latest);
                setSelected({});
                setPhase("select");
                toast("Your selected gifts were saved.");
              })
            }
          >
            {busy ? "Saving…" : "Confirm and add gifts"}
          </button>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => setPhase("select")}
          >
            Back to selection
          </button>
        </section>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
export function OfferLinks({
  candidate,
}: {
  candidate: Pick<GiftCandidate, "offers">;
}) {
  return (
    <ul className="discovery-offers">
      {candidate.offers.map((offer) => (
        <li key={offer.url}>
          <a href={offer.url} target="_blank" rel="noopener noreferrer">
            {offer.retailer} · {dollars(offer.priceCents)}{" "}
            <ExternalLink size={14} aria-hidden="true" />
          </a>
          <small>Checked {new Date(offer.checkedAt).toLocaleString()}</small>
        </li>
      ))}
    </ul>
  );
}
