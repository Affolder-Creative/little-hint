import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Actor } from "../shared/model";
import { readState, transact } from "./db";
import {
  config,
  discoveryConfiguration,
  discoveryConfigForState,
} from "./settings";
import { isAdmin, fail } from "./domain";
import {
  createDiscovery,
  discoveryContext,
  discoveryJob,
  discoveryIdempotent,
  prepareDiscoveryReview,
  saveDiscoveryReview,
  quotaKeys,
  discoveryMonthlyUsage,
} from "./gift-discovery";

export function registerGiftDiscovery(
  app: FastifyInstance,
  actor: (req: FastifyRequest) => Promise<Actor>,
) {
  app.get<{ Params: { personId: string } }>(
    "/api/v1/gift-discovery/context/:personId",
    async (req) => {
      const a = await actor(req),
        cfg = discoveryConfiguration(await config());
      return discoveryContext(
        await readState(),
        a,
        cfg,
        z.uuid().parse(req.params.personId),
      );
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/v1/gift-discovery/:id",
    async (req) => {
      const a = await actor(req),
        cfg = discoveryConfiguration(await config());
      return discoveryJob(
        await readState(),
        a,
        cfg,
        z.uuid().parse(req.params.id),
      );
    },
  );
  app.post("/api/v1/gift-discovery", async (req) => {
    const a = await actor(req);
    const body = z.object({ personId: z.uuid() }).passthrough().parse(req.body);
    return transact((s) => {
      const cfg = discoveryConfigForState(s);
      discoveryContext(s, a, cfg, body.personId);
      return discoveryIdempotent(
        s,
        a,
        String(req.headers["idempotency-key"] ?? ""),
        "discovery.create",
        body,
        () => createDiscovery(s, a, cfg, body),
      );
    });
  });
  for (const action of ["review", "save"] as const)
    app.post<{ Params: { id: string } }>(
      `/api/v1/gift-discovery/:id/${action}`,
      async (req) => {
        const a = await actor(req),
          id = z.uuid().parse(req.params.id);
        return transact((s) => {
          const cfg = discoveryConfigForState(s);
          discoveryJob(s, a, cfg, id);
          return discoveryIdempotent(
            s,
            a,
            String(req.headers["idempotency-key"] ?? ""),
            `discovery.${action}:${id}`,
            req.body,
            () =>
              action === "review"
                ? prepareDiscoveryReview(s, a, cfg, id, req.body)
                : saveDiscoveryReview(s, a, cfg, id, req.body),
          );
        });
      },
    );
  app.get("/api/v1/admin/gift-discovery", async (req) => {
    const a = await actor(req),
      s = await readState();
    if (!isAdmin(s, a)) fail(403, "Administrator access required.");
    const cfg = discoveryConfiguration(await config()),
      keys = quotaKeys(a.id),
      month = new Date().toISOString().slice(0, 7);
    const rows = s.usage.filter((u) =>
      u.key.startsWith(`discovery:metrics:${month}:`),
    );
    const total = (metric: string) =>
      rows
        .filter((u) => u.key.endsWith(`:${metric}`))
        .reduce((sum, u) => sum + u.count, 0);
    const usage = discoveryMonthlyUsage(s);
    const { searches } = usage;
    const unknownModel = rows.some(
      (u) => !u.key.startsWith(`discovery:metrics:${month}:gpt-6-luna:`),
    );
    return {
      config: cfg,
      ...usage,
      searchCalls: total("searches"),
      inputTokens: total("input"),
      outputTokens: total("output"),
      unreportedAttempts: Math.max(0, searches - total("reported")),
      resetsAt: keys.monthResetsAt,
      estimatedUsd: unknownModel
        ? null
        : total("searches") * 0.01 +
          (total("input") * 0.1) / 1e6 +
          (total("output") * 0.5) / 1e6,
      pricingAsOf: "2026-10-27",
    };
  });
}
