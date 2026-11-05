import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { captureLink, sharedCapture } from "../src/shared/capture";

describe("shopping capture", () => {
  it("extracts links from shopping messages without dropping variants", () => {
    expect(
      captureLink("Look at this: https://shop.example/item?size=4&color=red."),
    ).toBe("https://shop.example/item?size=4&color=red");
    expect(captureLink("(https://shop.example/item)!")).toBe(
      "https://shop.example/item",
    );
    expect(captureLink("https://shop.example/item_(blue)")).toBe(
      "https://shop.example/item_(blue)",
    );
  });
  it("rejects ambiguous, unsafe and oversized inputs", () => {
    for (const input of [
      "javascript:alert(1)",
      "file:///tmp/a",
      "https://user:password@shop.example/",
      "https://a.example https://b.example",
      "no link",
      "x".repeat(8193),
    ])
      expect(captureLink(input)).toBeNull();
  });
  it("deduplicates repeated links and accepts title/text-only platform payloads", () => {
    expect(captureLink("https://a.example https://a.example")).toBe(
      "https://a.example/",
    );
    for (const key of ["url", "text", "title"])
      expect(
        sharedCapture(
          new URLSearchParams({ [key]: "Try https://shop.example/product" }),
        ).url,
      ).toBe("https://shop.example/product");
    expect(
      sharedCapture(
        new URLSearchParams({
          url: "https://preferred.example",
          text: "https://other.example",
        }),
      ).url,
    ).toBe("https://preferred.example/");
  });
  it("ships matching manifests with a read-only capture entry point", () => {
    for (const path of [
      "public/brand/little-hint/manifest.webmanifest",
      "brand/little-hint-final/manifest.webmanifest",
    ])
      expect(JSON.parse(readFileSync(path, "utf8")).share_target).toEqual({
        action: "/capture",
        method: "GET",
        params: { title: "title", text: "text", url: "url" },
      });
  });
});
