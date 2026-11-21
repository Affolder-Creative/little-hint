import { createElement as h } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { discoveryFixture } from "./gift-discovery-fixture";
import { world } from "../src/server/domain";
import { spendingView } from "../src/server/spending";
import { AppContext } from "../src/client/context";
import { PurchaseForm } from "../src/client/SpendingPurchase";
vi.mock("../src/client/pwa", () => ({ useOnline: () => true }));

function renderPurchase(maximum: number | null) {
  const f = discoveryFixture();
  f.wish.priceCents = 40000;
  f.wish.priceMaxCents = maximum;
  const visible = world(f.state, f.actors[1]);
  const data = spendingView(f.state, f.actors[1]);
  data.settings.enabled = true;
  const client = new QueryClient();
  client.setQueryData(["spending", visible.me.id], data);
  const html = renderToStaticMarkup(
    h(
      MemoryRouter,
      null,
      h(
        QueryClientProvider,
        { client },
        h(
          AppContext.Provider,
          {
            value: {
              world: visible,
              mutate: vi.fn(),
              open: vi.fn(),
              close: vi.fn(),
              toast: vi.fn(),
              dark: false,
            },
          },
          h(PurchaseForm, {
            reservation: {
              id: "test-reservation",
              revision: 0,
              quantity: 1,
              purchased: 0,
              titleSnapshot: f.wish.title,
              item: visible.items.find((i) => i.id === f.wish.id),
            },
          }),
        ),
      ),
    ),
  );
  client.clear();
  return html;
}

it("shows a range without suggesting that its maximum is an amount paid", () => {
  const html = renderPurchase(70000);
  expect(html).toContain("$400–$700");
  expect(html).not.toContain("Use listed price");
  expect(html).toMatch(/name="amount"[^>]*value=""/);
});
it("retains explicit use-listed-price for exact prices", () => {
  const html = renderPurchase(null);
  expect(html).toContain("Use listed price");
  expect(html).toContain("$400");
  expect(html).toMatch(/name="amount"[^>]*value=""/);
});
