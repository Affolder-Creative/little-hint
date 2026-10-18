import { randomInt } from "node:crypto";
import type { Exchange, Person } from "../shared/model";
// Integral min-cost flow: each participant gives and receives exactly k gifts.
export function matchExchange(
  e: Exchange,
  people: Person[],
  previous: [string, string][] = [],
): [string, string][] {
  const ps = e.participantIds.map((id) => people.find((p) => p.id === id)!);
  if (ps.some((p) => !p) || ps.length > 100)
    throw new Error("Choose between 2 and 100 eligible participants.");
  const n = ps.length,
    k = e.count,
    N = 2 * n + 2,
    S = 2 * n,
    T = S + 1;
  type Edge = { to: number; rev: number; cap: number; cost: number };
  const graph: Edge[][] = Array.from({ length: N }, () => []);
  const edge = (a: number, b: number, cap: number, cost: number) => {
    graph[a].push({ to: b, rev: graph[b].length, cap, cost });
    graph[b].push({ to: a, rev: graph[a].length - 1, cap: 0, cost: -cost });
  };
  const controls = (p: Person) => [p.userId, ...p.guardians].filter(Boolean);
  for (let i = 0; i < n; i++) {
    edge(S, i, k, 0);
    edge(n + i, T, k, 0);
    const order = Array.from({ length: n }, (_, j) => j);
    for (let j = n - 1; j > 0; j--) {
      const r = randomInt(j + 1);
      [order[j], order[r]] = [order[r], order[j]];
    }
    for (const j of order) {
      if (
        i === j ||
        controls(ps[i]).some((a) => controls(ps[j]).includes(a)) ||
        (e.excludeHousehold &&
          ps[i].household &&
          ps[i].household === ps[j].household) ||
        e.exclusions.some(([a, b]) => a === ps[i].id && b === ps[j].id)
      )
        continue;
      edge(
        i,
        n + j,
        1,
        previous.some(([a, b]) => a === ps[i].id && b === ps[j].id) ? 1 : 0,
      );
    }
  }
  let flow = 0;
  while (flow < n * k) {
    const dist = Array(N).fill(Infinity),
      prev = Array.from({ length: N }, () => [-1, -1]);
    dist[S] = 0;
    for (let iteration = 0; iteration < N - 1; iteration++) {
      let changed = false;
      for (let a = 0; a < N; a++)
        for (let j = 0; j < graph[a].length; j++) {
          const b = graph[a][j];
          if (b.cap && dist[a] + b.cost < dist[b.to]) {
            dist[b.to] = dist[a] + b.cost;
            prev[b.to] = [a, j];
            changed = true;
          }
        }
      if (!changed) break;
    }
    if (!Number.isFinite(dist[T]))
      throw new Error(
        "These exclusions cannot produce a balanced draw. Add participants, reduce recipients per giver, or relax exclusions.",
      );
    for (let v = T; v !== S;) {
      const [a, j] = prev[v],
        b = graph[a][j];
      b.cap--;
      graph[v][b.rev].cap++;
      v = a;
    }
    flow++;
  }
  const result: [string, string][] = [];
  for (let i = 0; i < n; i++)
    for (const b of graph[i])
      if (b.to >= n && b.to < 2 * n && b.cap === 0)
        result.push([ps[i].id, ps[b.to - n].id]);
  return result;
}
