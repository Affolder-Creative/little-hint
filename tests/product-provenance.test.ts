import { it, expect } from "vitest";
import { discoveryFixture } from "./gift-discovery-fixture";
import { command, stamp } from "../src/server/domain";
import { importView } from "../src/shared/imports";
import type { Item, ImportJob } from "../src/shared/model";
it("copies only matching source fields on save and removes attribution on edits", () => {
  const f = discoveryFixture();
  const url = "https://shop.example/mug";
  const job: ImportJob = {
    ...stamp(),
    userId: f.actors[0].id,
    url,
    status: "complete",
    result: {
      title: "Mug",
      description: "Ceramic",
      productSources: [
        {
          url,
          fields: ["title", "description"],
          method: "web",
          checkedAt: new Date().toISOString(),
        },
      ],
    },
  };
  f.state.imports.push(job);
  const saved = command(f.state, f.actors[0], "items.create", {
    title: "Mug",
    description: "My own description",
    url,
    listId: f.list.id,
    importId: job.id,
  }) as Item;
  const item = f.state.items.find((i) => i.id === saved.id)!;
  expect(item.productSources?.[0].fields).toEqual(["title"]);
  command(f.state, f.actors[0], "items.update", {
    ...item,
    id: saved.id,
    title: "Personal mug",
    description: "My own description",
    url,
  });
  expect(item.productSources).toEqual([]);
});
it("never exposes execution checkpoints to shoppers", () => {
  const job = {
    ...stamp(),
    userId: "owner",
    url: "https://shop.example/mug",
    status: "running" as const,
    recoveryState: { web: { status: "dispatched" as const } },
    recoveryCheckpoint: {
      url: "https://shop.example/mug",
      result: {},
      evidence: { text: "private checkpoint", images: [] },
    },
  };
  expect(JSON.stringify(importView(job))).not.toContain("checkpoint");
  expect(importView(job)).not.toHaveProperty("recoveryState");
});
