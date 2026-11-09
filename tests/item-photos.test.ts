import { afterEach, expect, it, vi } from "vitest";
import { wishlistFixture } from "./wishlist-fixture";
import { command, stamp } from "../src/server/domain";
import { itemPhotoLimit } from "../src/server/photo-config";
import {
  galleryPhotos,
  itemPhotos,
  removeItemPhoto,
} from "../src/shared/item-photos";
import type { Item } from "../src/shared/model";
afterEach(() => vi.unstubAllEnvs());
function fixture() {
  const f = wishlistFixture();
  const urls = Array.from({ length: 7 }, () => {
    const media = { ...stamp(), userId: f.john.id, file: "test.webp" };
    f.s.media.push(media);
    return `/api/v1/media/${media.id}`;
  });
  const create = (images = urls.slice(0, 3)) =>
    command(f.s, f.john, "items.create", {
      title: "Gallery",
      listId: f.list.id,
      image: images[0],
      images,
    }) as Item;
  return { ...f, urls, create };
}
it("validates environment limits", () => {
  expect(itemPhotoLimit()).toBe(5);
  for (const value of ["0", "-1", "1.5", "no", "Infinity"]) {
    vi.stubEnv("ITEM_PHOTO_LIMIT", value);
    expect(() => itemPhotoLimit()).toThrow("ITEM_PHOTO_LIMIT");
  }
  vi.stubEnv("ITEM_PHOTO_LIMIT", "10");
  expect(itemPhotoLimit()).toBe(10);
  vi.stubEnv("ITEM_PHOTO_LIMIT", "");
  expect(itemPhotoLimit()).toBe(5);
});
it("preserves upload order independently of the cover and promotes after removal", () => {
  const item = { image: "b", images: ["a", "b", "c"] };
  expect(galleryPhotos(item)).toEqual(["b", "a", "c"]);
  removeItemPhoto(item, "b");
  expect(item).toEqual({ image: "a", images: ["a", "c"] });
  expect(itemPhotos({ image: "legacy" })).toEqual(["legacy"]);
});
it("enforces counts and authorizes every image", () => {
  const f = fixture();
  expect(() => f.create(f.urls)).toThrow("5 photos");
  f.s.media[2].userId = f.reader.id;
  expect(() => f.create()).toThrow("Image not found");
});
it("keeps galleries when older clients update the cover", () => {
  const f = fixture();
  const i = f.create();
  const { images, ...legacy } = i;
  command(f.s, f.john, "items.update", { ...legacy, image: f.urls[3] });
  expect(itemPhotos(f.s.items[0])).toEqual([f.urls[1], f.urls[2], f.urls[3]]);
});
it("grandfathers existing galleries after lowering the limit without permitting growth", () => {
  const f = fixture();
  const i = f.create();
  vi.stubEnv("ITEM_PHOTO_LIMIT", "1");
  command(f.s, f.john, "items.update", {
    ...i,
    title: "New title",
    image: f.urls[1],
  });
  const saved = f.s.items[0];
  expect(saved.images).toHaveLength(3);
  expect(() =>
    command(f.s, f.john, "items.update", {
      ...saved,
      images: [...saved.images!, f.urls[3]],
    }),
  ).toThrow("1 photos");
  command(f.s, f.john, "items.update", {
    ...saved,
    images: [f.urls[1]],
    image: f.urls[1],
  });
  expect(f.s.items[0].images).toEqual([f.urls[1]]);
});
it("saves and publishes galleries in wish-list drafts", () => {
  const f = fixture();
  const i = command(f.s, f.john, "items.create", {
    title: "Draft",
    listId: f.list.id,
    images: f.urls.slice(0, 2),
    publicationState: "draft",
  }) as Item;
  expect(i.image).toBe(f.urls[0]);
  command(f.s, f.john, "items.publish", i);
  expect(f.s.items[0].images).toEqual(f.urls.slice(0, 2));
});
it("retains import-draft photos across edits and rejects unauthorized attachments", () => {
  const f = fixture();
  const job: any = command(f.s, f.john, "imports.create", {
    url: "https://example.com/product",
    draft: {
      listId: f.list.id,
      fields: { image: f.urls[0], images: f.urls.slice(0, 2) },
      touched: ["image", "images"],
    },
  });
  command(f.s, f.john, "imports.update", {
    id: job.id,
    revision: job.draft.revision,
    fields: { title: "Updated", image: f.urls[0] },
  });
  expect(job.draft.fields.images).toEqual(f.urls.slice(0, 2));
  f.s.media[3].userId = f.reader.id;
  expect(() =>
    command(f.s, f.john, "imports.update", {
      id: job.id,
      revision: job.draft.revision,
      fields: { image: f.urls[0], images: [f.urls[3]] },
    }),
  ).toThrow("Image not found");
  expect(() =>
    command(f.s, f.john, "imports.update", {
      id: job.id,
      revision: job.draft.revision,
      fields: { image: "https://example.com/photo" },
    }),
  ).toThrow("Choose an imported");
});
it("preserves formatted notes and gallery photos through import editing and publishing", () => {
  const f = fixture();
  const note = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Blue, size medium",
            marks: [{ type: "bold" }],
          },
        ],
      },
    ],
  };
  const job: any = command(f.s, f.john, "imports.create", {
    url: "https://example.com/sweater",
    draft: {
      listId: f.list.id,
      descriptionRich: note,
      fields: {
        title: "Sweater",
        description: "",
        image: f.urls[0],
        images: f.urls.slice(0, 2),
      },
      touched: ["image", "images", "description"],
    },
  });
  command(f.s, f.john, "imports.update", {
    id: job.id,
    revision: job.draft.revision,
    descriptionRich: note,
    fields: { ...job.draft.fields, image: f.urls[1] },
  });
  expect(job.draft.fields.description).toBe("Blue, size medium");
  expect(job.draft.fields.images).toEqual(f.urls.slice(0, 2));
  const item = command(f.s, f.john, "items.create", {
    title: "Sweater",
    listId: f.list.id,
    url: job.url,
    importId: job.id,
    importDraftRevision: job.draft.revision,
    descriptionRich: job.draft.descriptionRich,
    image: job.draft.fields.image,
    images: job.draft.fields.images,
  }) as Item;
  expect(item.descriptionRich).toEqual(note);
  expect(item.description).toBe("Blue, size medium");
  expect(item.image).toBe(f.urls[1]);
  expect(item.images).toEqual(f.urls.slice(0, 2));
  command(f.s, f.john, "items.update", { ...item, image: f.urls[0] });
  expect(f.s.items[0].descriptionRich).toEqual(note);
  expect(f.s.items[0].images).toEqual(f.urls.slice(0, 2));
});
