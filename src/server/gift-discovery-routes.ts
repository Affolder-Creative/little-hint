import { adminUsage } from "./usage";
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
    const cfg = await config();
    const report = adminUsage(s, cfg);
    const u = report.suggestions;
    return {
      config: discoveryConfiguration(cfg),
      searches: u.requests,
      quotaSearches: u.quotaSearches,
      exemptSearches: u.exemptSearches,
      searchCalls: u.searchCalls,
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      unreportedAttempts: u.unreported,
      resetsAt: report.resetsAt,
      estimatedUsd: u.estimatedUsd,
      pricingAsOf: report.pricingAsOf,
    };
  });
}
