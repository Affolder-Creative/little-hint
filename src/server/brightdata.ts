import { transact } from "./db";
import { spend } from "./settings";
import { validateUrl, boundedBody } from "./imports";
import type { ImportJob, Item } from "../shared/model";
import { retailerCollectionTimeoutMs } from "../shared/imports";

export class ImportPending extends Error {}
export class BrightDataFailure extends Error {
  constructor(
    public stage: string,
    message: string,
    public status?: number,
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
const datasets: Record<string, string> = {
  "amazon.com": "gd_l7q7dkf244hwjntr0",
  "walmart.com": "gd_l95fol7l1ru6rlo116",
  "target.com": "gd_ltppk5mx2lp0v1k0vo",
  "bestbuy.com": "gd_ltre1jqe1jfr7cccf",
};
export function retailerDataset(value: string) {
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
            : false;
  return product ? datasets[host] : undefined;
}
export function normalizeRetailer(
  row: any,
  url: string,
): Partial<Item> & { sourceTitle: string; remoteImage?: string } {
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
export async function brightRetailer(url: string, key: string, jobId: string) {
  await validateUrl(url);
  let state: ImportJob["providerState"];
  await transact((s) => {
    const job = s.imports.find((j) => j.id === jobId);
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
      await spend("brightdata");
    } catch (error) {
      await transact((s) => {
        delete s.imports.find((j) => j.id === jobId)!.providerState;
      });
      throw new BrightDataFailure(
        "brightdata-budget",
        "Daily paid-request allowance exhausted or unavailable",
      );
    }
    let result;
    try {
      result = await jsonRequest(
        `/datasets/v3/trigger?dataset_id=${retailerDataset(url)}&include_errors=true&notify=false`,
        key,
        {
          input: [
            {
              url,
              ...(new URL(url).hostname.replace(/^www\./, "") === "amazon.com"
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
          delete s.imports.find((j) => j.id === jobId)!.providerState;
        });
      throw error;
    }
    if (typeof result.snapshot_id !== "string")
      throw new Error("Missing collection ID");
    await transact((s) => {
      const j = s.imports.find((j) => j.id === jobId)!;
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
      s.imports.find((j) => j.id === jobId)!.providerState!.nextPollAt =
        new Date(Date.now() + 10000).toISOString();
    });
    throw new ImportPending();
  }
  if (progress.status !== "ready") {
    if (["failed", "canceled"].includes(progress.status))
      await transact((s) => {
        s.imports.find((j) => j.id === jobId)!.providerState!.terminal = true;
      });
    throw new Error("Collection failed");
  }
  const result = await jsonRequest(
    `/datasets/v3/snapshot/${path}?format=json`,
    key,
  );
  if (!Array.isArray(result) || result.length !== 1)
    throw new Error("Unexpected product count");
  return normalizeRetailer(result[0], url);
}
export async function unlockPage(url: string, cfg: Record<string, string>) {
  await validateUrl(url);
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
      format: "json",
      country: "us",
    }),
    redirect: "error",
    signal: AbortSignal.timeout(100000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Unlocker HTTP ${response.status}`);
  }
  const envelope = JSON.parse((await boundedBody(response)).toString("utf8"));
  if (envelope.status_code !== 200 || typeof envelope.body !== "string")
    throw new Error("Shop unavailable");
  return envelope.body as string;
}
