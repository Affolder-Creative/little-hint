import { unlockerDiagnostic } from "./lookup-diagnostics";
import type { LookupDiagnostic } from "../shared/lookup-diagnostics";
import { transact } from "./db";
import { spend } from "./settings";
import { validateUrl, boundedBody } from "./imports";
import type { ImportJob, Item } from "../shared/model";
import { retailerCollectionTimeoutMs } from "../shared/imports";
import { etsyListingId, normalizeEtsyProduct } from "./etsy";

export class ImportPending extends Error {}
export class BrightDataFailure extends Error {
  constructor(
    public stage: string,
    message: string,
    public status?: number,
    public diagnostic?: LookupDiagnostic,
  ) {
    super(message);
  }
}
// Never retain raw provider errors: they can echo credentials or product URLs.
export function brightDataFailureReason(status: number, body: string) {
  let message = body;
  let fields: string[] = [];
  try {
    const data = JSON.parse(body);
    message = [data.error, data.message, data.code, data.error_code]
      .filter((v) => typeof v === "string")
      .join(" ");
    const allowed = new Set([
      "url",
      "input",
      "limit_per_input",
      "all_variations",
      "zipcode",
      "language",
      "dataset_id",
      "notify",
      "zone",
    ]);
    if (Array.isArray(data.errors))
      fields = [
        ...new Set<string>(
          data.errors.flatMap((row: unknown) =>
            Array.isArray(row) && allowed.has(row[0]) ? [row[0]] : [],
          ),
        ),
      ];
  } catch {
    /* Plain-text rejections use the same fixed categories. */
  }
  const detail = fields.length
    ? `Invalid request fields: ${fields.join(", ")}`
    : /limit_per_input/i.test(message)
      ? "Record limit rejected"
      : /invalid.*input|validation_error|invalid.*url|input.*array/i.test(
            message,
          )
        ? "Request input rejected"
        : /insufficient|balance|payment|billing|credit/i.test(message)
          ? "Account billing or credit restriction"
          : /not active|inactive|suspended|disabled/i.test(message)
            ? "Account or service inactive"
            : /permission|access denied|not authorized|not allowed/i.test(
                  message,
                )
              ? "Account lacks access to this service"
              : /dataset.*(not found|does not exist|invalid)/i.test(message)
                ? "Scraper dataset unavailable"
                : /credential|api.?key|authentication|token/i.test(message)
                  ? "API credentials rejected"
                  : status === 429
                    ? "Provider rate or quota limit"
                    : "Request rejected; check provider access and request configuration";
  return `Bright Data HTTP ${status}: ${detail}`;
}
export function verifiedInStock(row: {
  in_stock?: unknown;
  availability?: unknown;
}) {
  const positive = (value: unknown) =>
    value === true ||
    (typeof value === "string" &&
      /^(instock|in_stock|in stock)$/.test(value.trim().toLowerCase()));
  const values = [row.in_stock, row.availability].filter((v) => v != null);
  return values.length > 0 && values.every(positive);
}
const datasets: Record<string, string> = {
  "amazon.com": "gd_l7q7dkf244hwjntr0",
  "walmart.com": "gd_l95fol7l1ru6rlo116",
  "target.com": "gd_ltppk5mx2lp0v1k0vo",
  "bestbuy.com": "gd_ltre1jqe1jfr7cccf",
  "etsy.com": "gd_ltppk0jdv1jqz25mz",
};
export function retailerDataset(
  value: string,
  purpose: "import" | "price" = "import",
) {
  const u = new URL(value),
    host = u.hostname.replace(/^www\./, "");
  const product =
    host === "amazon.com"
      ? /\/(dp|gp\/product)\/[A-Z0-9]{10}/i.test(u.pathname)
      : host === "walmart.com"
        ? u.pathname.startsWith("/ip/")
        : host === "target.com"
          ? u.pathname.startsWith("/p/")
          : host === "bestbuy.com"
            ? /\/(?:\d+\.p|sku\/\d+)\/?$/.test(u.pathname)
            : !!etsyListingId(value);
  return product ? datasets[host] : undefined;
}
export function normalizeRetailer(
  row: any,
  url: string,
): Partial<Item> & {
  sourceTitle: string;
  remoteImage?: string;
  warnings?: string[];
} {
  if (etsyListingId(url)) {
    try {
      return normalizeEtsyProduct(row, url);
    } catch {
      throw new BrightDataFailure(
        "brightdata-result",
        "Etsy product details or listing identity could not be verified",
      );
    }
  }
  if (!row || row.error) throw new Error("Retailer returned no product");
  const title = row.title ?? row.product_name ?? row.name;
  if (typeof title !== "string" || !title.trim())
    throw new Error("Retailer returned no product name");
  const requested = new URL(url).pathname.match(
    /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i,
  )?.[1];
  if (
    requested &&
    row.asin &&
    requested.toUpperCase() !== String(row.asin).toUpperCase()
  )
    throw new Error("Product identity mismatch");
  const host = new URL(url).hostname.replace(/^www\./, "");
  const requestedId =
    host === "walmart.com"
      ? new URL(url).pathname.split("/").pop()
      : host === "target.com"
        ? /^\d+$/.test(new URL(url).searchParams.get("preselect") ?? "")
          ? new URL(url).searchParams.get("preselect")
          : new URL(url).pathname.match(/A-(\d+)/)?.[1]
        : host === "bestbuy.com"
          ? new URL(url).pathname.match(/\/(?:sku\/)?(\d+)(?:\.p)?\/?$/)?.[1]
          : undefined;
  const returnedId =
    host === "target.com"
      ? (row.tcin_id ?? row.product_id)
      : host === "bestbuy.com"
        ? (row.sku ?? row.product_id)
        : row.product_id;
  if (requestedId && returnedId && String(requestedId) !== String(returnedId))
    throw new BrightDataFailure(
      "brightdata-result",
      "Returned product does not match the requested product or selected option",
    );
  const price = row.final_price ?? row.sale_price ?? row.price;
  const parseAmount = (value: unknown) =>
    typeof value === "number"
      ? value
      : typeof value === "string" &&
          /^\$?[\d,]+(?:\.\d{1,2})?$/.test(value.trim())
        ? Number(value.trim().replace(/[$,]/g, ""))
        : NaN;
  const amount = parseAmount(price);
  // Target also uses price_range for a single selected variant's price.
  // Only accept a scalar that agrees with the selected product price.
  const hasUncertainRange = [row.final_price_high, row.price_range].some(
    (value) =>
      value !== undefined &&
      value !== null &&
      value !== "" &&
      parseAmount(value) !== amount,
  );
  const image =
    row.image_url ??
    row.main_image ??
    row.image ??
    row.images?.[0] ??
    row.image_urls?.[0];
  return {
    title: title.trim().slice(0, 160),
    sourceTitle: title.trim().slice(0, 2000),
    description: String(row.description ?? row.product_description ?? "").slice(
      0,
      5000,
    ),
    priceCents:
      row.currency === "USD" &&
      !hasUncertainRange &&
      Number.isFinite(amount) &&
      amount >= 0
        ? Math.round(amount * 100)
        : null,
    currency: "USD",
    tags: [],
    source: new URL(url).hostname,
    importedAt: new Date().toISOString(),
    ...(typeof image === "string" ? { remoteImage: image } : {}),
  };
}
async function jsonRequest(path: string, key: string, body?: unknown) {
  const stage = body
    ? "brightdata-submit"
    : path.includes("/progress/")
      ? "brightdata-progress"
      : "brightdata-result";
  const response = await fetch(`https://api.brightdata.com${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    let text = "";
    try {
      text = (await boundedBody(response, 16384)).toString("utf8");
    } catch {
      /* Keep the HTTP status when the body cannot be read. */
    }
    throw new BrightDataFailure(
      stage,
      brightDataFailureReason(response.status, text),
      response.status,
    );
  }
  return JSON.parse((await boundedBody(response)).toString("utf8"));
}
export async function brightRetailer(
  url: string,
  key: string,
  jobId: string,
  priceCheck = false,
) {
  await validateUrl(url);
  const dataset = retailerDataset(url, priceCheck ? "price" : "import");
  if (!dataset)
    throw new BrightDataFailure(
      "brightdata-submit",
      "Unsupported retailer product link",
    );
  let state: ImportJob["providerState"];
  await transact((s) => {
    const job = [...s.imports, ...s.priceChecks].find((j) => j.id === jobId);
    if (!job) throw new Error("Import missing");
    state = job.providerState;
    if (!state)
      job.providerState = {
        submittedAt: new Date().toISOString(),
        deadline: new Date(
          Date.now() + retailerCollectionTimeoutMs,
        ).toISOString(),
      };
  });
  if (!state) {
    try {
      await (priceCheck
        ? spend("brightdata", true, "brightdata-scraper")
        : spend("brightdata"));
    } catch (error) {
      await transact((s) => {
        delete [...s.imports, ...s.priceChecks].find((j) => j.id === jobId)!
          .providerState;
      });
      throw new BrightDataFailure(
        "brightdata-budget",
        "Daily paid-request allowance exhausted or unavailable",
      );
    }
    let result;
    try {
      result = await jsonRequest(
        `/datasets/v3/trigger?dataset_id=${dataset}&include_errors=true&notify=false`,
        key,
        {
          input: [
            {
              url,
              ...(new URL(url).hostname.replace(/^www\./, "") ===
                "amazon.com" || etsyListingId(url)
                ? { all_variations: false }
                : {}),
            },
          ],
          limit_per_input: 1,
        },
      );
    } catch (error) {
      if (
        error instanceof BrightDataFailure &&
        [400, 401, 403, 404, 422, 429].includes(error.status ?? 0)
      )
        await transact((s) => {
          delete [...s.imports, ...s.priceChecks].find((j) => j.id === jobId)!
            .providerState;
        });
      throw error;
    }
    if (typeof result.snapshot_id !== "string")
      throw new Error("Missing collection ID");
    await transact((s) => {
      const j = [...s.imports, ...s.priceChecks].find((j) => j.id === jobId)!;
      j.providerState!.snapshotId = result.snapshot_id;
      j.providerState!.nextPollAt = new Date(Date.now() + 10000).toISOString();
    });
    throw new ImportPending();
  }
  if (!state.snapshotId)
    throw new Error(
      "Submission outcome uncertain; do not automatically resubmit",
    );
  const path = encodeURIComponent(state.snapshotId);
  const progress = await jsonRequest(`/datasets/v3/progress/${path}`, key);
  if (["starting", "running"].includes(progress.status)) {
    // A delayed worker must still download a collection that finished before
    // its final check. Only time out a collection the provider says is pending.
    if (Date.now() > Date.parse(state.deadline))
      throw new BrightDataFailure(
        "brightdata-progress",
        "Collection still running at the waiting limit; retry resumes the same collection",
      );
    await transact((s) => {
      [...s.imports, ...s.priceChecks].find(
        (j) => j.id === jobId,
      )!.providerState!.nextPollAt = new Date(Date.now() + 10000).toISOString();
    });
    throw new ImportPending();
  }
  if (progress.status !== "ready") {
    if (["failed", "canceled"].includes(progress.status))
      await transact((s) => {
        [...s.imports, ...s.priceChecks].find(
          (j) => j.id === jobId,
        )!.providerState!.terminal = true;
      });
    throw new Error("Collection failed");
  }
  const result = await jsonRequest(
    `/datasets/v3/snapshot/${path}?format=json`,
    key,
  );
  if (!Array.isArray(result) || result.length !== 1)
    throw new Error("Unexpected product count");
  if (priceCheck) {
    const row = result[0];
    const ids = [row.asin, row.product_id, row.tcin_id, row.sku]
      .filter(Boolean)
      .map(String);
    const requested =
      etsyListingId(url) ??
      new URL(url).searchParams.get("preselect") ??
      new URL(url).pathname
        .match(/(?:dp|product|sku)\/([A-Z0-9]+)|A-(\d+)|(\d+)\.p/i)
        ?.slice(1)
        .find(Boolean) ??
      new URL(url).pathname.split("/").pop();
    if (etsyListingId(url) && row.listing_has_variations !== false)
      throw new Error("Etsy listing options cannot be verified");
    if (!requested || !ids.includes(requested))
      throw new Error("Product identity mismatch");
    if (!verifiedInStock(row))
      throw new Error("In-stock availability cannot be verified");
    if (row.price_type || row.subscription_price || row.member_price)
      throw new Error("Product price cannot be verified");
  }
  return normalizeRetailer(result[0], url);
}
export async function unlockPage(
  url: string,
  cfg: Record<string, string>,
  priceCheck = false,
  render = false,
) {
  await validateUrl(url);
  await (priceCheck
    ? spend("brightdata", true, "brightdata-unlocker")
    : spend("brightdata"));
  const response = await fetch("https://api.brightdata.com/request", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.BRIGHTDATA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      zone: cfg.BRIGHTDATA_UNLOCKER_ZONE,
      url,
      format: "json",
      ...(render ? { render: "true" } : {}),
      country: "us",
    }),
    redirect: "error",
    signal: AbortSignal.timeout(100000),
  });
  let envelope: any;
  try {
    envelope = JSON.parse((await boundedBody(response)).toString("utf8"));
  } catch {
    const diagnostic = unlockerDiagnostic(
      response.status,
      {},
      response.headers,
    );
    diagnostic.reason = response.ok
      ? "Provider returned an invalid or oversized response"
      : diagnostic.reason;
    throw new BrightDataFailure(
      "brightdata-unlocker",
      diagnostic.reason,
      response.status,
      diagnostic,
    );
  }
  if (
    !response.ok ||
    envelope?.status_code !== 200 ||
    typeof envelope?.body !== "string"
  ) {
    const status = response.ok
      ? Number(envelope?.status_code) || 0
      : response.status;
    const diagnostic = unlockerDiagnostic(status, envelope, response.headers);
    throw new BrightDataFailure(
      "brightdata-unlocker",
      `${response.ok ? "Shop" : "Unlocker"} HTTP ${status || "unknown"}: ${diagnostic.reason}`,
      status,
      diagnostic,
    );
  }
  return envelope.body as string;
}

/** A single budgeted image attempt, restricted to REI's public media paths. */
export async function unlockReiImage(url: string, cfg: Record<string, string>) {
  const u = await validateUrl(url);
  if (
    u.protocol !== "https:" ||
    !["rei.com", "www.rei.com"].includes(u.hostname) ||
    !u.pathname.startsWith("/media/")
  )
    throw new Error("Unsupported REI image");
  await spend("brightdata");
  const response = await fetch("https://api.brightdata.com/request", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.BRIGHTDATA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      zone: cfg.BRIGHTDATA_UNLOCKER_ZONE,
      url,
      format: "raw",
      country: "us",
    }),
    redirect: "error",
    signal: AbortSignal.timeout(35000),
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (
    !response.ok ||
    !/^image\/(png|jpeg|webp|gif)(?:;|$)/i.test(contentType)
  ) {
    await response.body?.cancel();
    throw new Error("REI image unavailable");
  }
  return { buffer: await boundedBody(response, 5_000_000), contentType };
}
