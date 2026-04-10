const DEFAULT_PRODUCT_URL =
  "https://ablecarry.com/products/max-edc-earth-green?variant=51046764577080";
const NTFY_TOPIC = "ablecarry-stock-monitor";
const USER_AGENT = "Mozilla/5.0 (compatible; AbleCarryStockMonitor/1.0)";

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface ScheduledController {
  cron: string;
  scheduledTime: number;
  type: "scheduled";
}

interface Env {
  STORE: KVNamespace;
}

type StockStatus = "InStock" | "OutOfStock" | "Unknown";

interface State {
  productUrl: string;
  productName: string | null;
  lastStatus: StockStatus;
  lastCheck: string | null;
  lastError: string | null;
  notified: boolean;
}

interface ProductDetails {
  availability: "InStock" | "OutOfStock";
  productName: string;
}

interface ProductSearchResult {
  availability: string | null;
  productName: string | null;
}

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return handleDashboard(env);
    }

    if (request.method === "POST" && url.pathname === "/url") {
      return handleUpdateUrl(request, env);
    }

    if (request.method === "GET" && url.pathname === "/check") {
      try {
        await runStockCheck(env);
      } catch {
        // Errors are persisted in KV for the dashboard to display.
      }

      return Response.redirect(`${url.origin}/`, 302);
    }

    return new Response("Not Found", { status: 404 });
  },

  async scheduled(
    _event: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(runStockCheck(env));
  },
};

export default worker;

async function handleDashboard(env: Env): Promise<Response> {
  const state = await loadState(env);
  const productName = state.productName || "Unknown Product";
  const isInStock = state.lastStatus === "InStock";
  const lastCheckText = state.lastCheck ? formatTimestamp(state.lastCheck) : "Never";
  const statusText = formatStockStatus(state.lastStatus);
  const statusTone = isInStock ? "status-live" : "status-idle";

  return htmlResponse(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Stock Monitor</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0e172b;
        --bg-elevated: rgba(15, 23, 42, 0.62);
        --bg-hover: rgba(226, 232, 240, 0.045);
        --border: rgba(148, 163, 184, 0.08);
        --text: #ccd6f6;
        --muted: #94a3b8;
        --accent: #5eebd4;
        --accent-soft: rgba(94, 235, 212, 0.12);
        --selection-text: #134e4a;
        --scrollbar-bg: #0f172a;
        --scrollbar-thumb: #5b6785;
        --radius: 22px;
        --radius-sm: 999px;
        --transition: 150ms ease-out;
      }

      * {
        box-sizing: border-box;
      }

      *::selection {
        background: var(--accent);
        color: var(--selection-text);
      }

      html {
        scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-bg);
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: Inter, system-ui, ui-sans-serif, sans-serif;
        background:
          radial-gradient(circle at top left, rgba(94, 235, 212, 0.08), transparent 28%),
          radial-gradient(circle at top right, rgba(148, 163, 184, 0.08), transparent 24%),
          var(--bg);
        color: var(--text);
      }

      body::-webkit-scrollbar {
        width: 12px;
      }

      body::-webkit-scrollbar-track {
        background: var(--scrollbar-bg);
      }

      body::-webkit-scrollbar-thumb {
        background: var(--scrollbar-thumb);
        border-radius: 999px;
        border: 3px solid var(--scrollbar-bg);
      }

      a,
      button,
      input {
        transition:
          background-color var(--transition),
          border-color var(--transition),
          color var(--transition),
          box-shadow var(--transition),
          transform var(--transition);
      }

      .shell {
        width: min(1080px, calc(100% - 32px));
        margin: 0 auto;
        padding: 40px 0 56px;
      }

      .header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 20px;
        margin-bottom: 28px;
      }

      h1 {
        margin: 0;
        font-size: clamp(2rem, 5vw, 2.9rem);
        line-height: 1;
        letter-spacing: -0.03em;
      }

      .tag {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 32px;
        padding: 0 14px;
        border-radius: var(--radius-sm);
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 0.92rem;
        font-weight: 600;
        text-decoration: none;
      }

      .layout {
        display: grid;
        grid-template-columns: minmax(0, 1.55fr) minmax(320px, 0.95fr);
        gap: 18px;
      }

      .stack {
        display: grid;
        gap: 18px;
      }

      .card {
        background: var(--bg-elevated);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 24px;
        backdrop-filter: blur(16px);
      }

      .card:hover {
        background: rgba(226, 232, 240, 0.045);
        border-color: rgba(148, 163, 184, 0.14);
      }

      .section-label {
        margin: 0 0 16px;
        color: #e2e8f0;
        font-size: 11.5px;
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
      }

      .hero-card {
        display: grid;
        gap: 24px;
      }

      .status-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 12px;
      }

      .status-pill {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        min-height: 40px;
        padding: 0 16px;
        border-radius: var(--radius-sm);
        background: rgba(148, 163, 184, 0.08);
        color: var(--text);
        font-weight: 600;
      }

      .status-pill.status-live {
        background: var(--accent-soft);
        color: var(--accent);
      }

      .status-pill.status-idle {
        color: var(--muted);
      }

      .dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: currentColor;
        box-shadow: 0 0 14px currentColor;
      }

      .metric-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      .metric {
        padding: 18px;
        border-radius: 18px;
        border: 1px solid var(--border);
        background: rgba(15, 23, 42, 0.34);
      }

      .metric-label {
        margin: 0 0 10px;
        color: var(--muted);
        font-size: 0.82rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .metric-value {
        margin: 0;
        color: var(--text);
        font-size: 1rem;
        line-height: 1.6;
        word-break: break-word;
      }

      .muted {
        color: var(--muted);
      }

      .link {
        color: var(--accent);
        text-decoration: none;
      }

      .link:hover {
        text-decoration: underline;
      }

      form {
        display: grid;
        gap: 14px;
      }

      label {
        color: var(--muted);
        font-size: 0.92rem;
      }

      input[type="url"] {
        width: 100%;
        min-height: 48px;
        padding: 0 16px;
        border: 1px solid var(--border);
        border-radius: 14px;
        background: rgba(15, 23, 42, 0.66);
        color: var(--text);
        font: inherit;
      }

      input[type="url"]:focus {
        outline: none;
        border-color: rgba(94, 235, 212, 0.42);
        box-shadow: 0 0 0 4px rgba(94, 235, 212, 0.12);
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }

      .button,
      .button-secondary {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 46px;
        padding: 0 18px;
        border-radius: 14px;
        border: 1px solid transparent;
        cursor: pointer;
        font: inherit;
        font-weight: 600;
        text-decoration: none;
      }

      .button {
        background: var(--accent);
        color: #082f30;
      }

      .button:hover {
        transform: translateY(-1px);
        box-shadow: 0 14px 24px rgba(94, 235, 212, 0.14);
      }

      .button-secondary {
        background: rgba(15, 23, 42, 0.45);
        border-color: var(--border);
        color: var(--text);
      }

      .button-secondary:hover {
        background: var(--bg-hover);
      }

      .error-box {
        min-height: 120px;
        padding: 18px;
        border-radius: 18px;
        border: 1px solid var(--border);
        background: rgba(15, 23, 42, 0.34);
        color: ${state.lastError ? "#fda4af" : "var(--muted)"};
        white-space: pre-wrap;
        line-height: 1.6;
      }

      @media (max-width: 900px) {
        .layout {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 640px) {
        .shell {
          width: min(100% - 20px, 1080px);
          padding: 20px 0 28px;
        }

        .header {
          flex-direction: column;
          margin-bottom: 18px;
        }

        .card {
          padding: 18px;
          border-radius: 18px;
        }

        .metric-grid {
          grid-template-columns: 1fr;
        }

        .actions {
          flex-direction: column;
        }

        .button,
        .button-secondary {
          width: 100%;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <header class="header">
        <div>
          <h1>Stock Monitor</h1>
        </div>
        <a class="tag" href="https://ntfy.sh/${escapeHtml(NTFY_TOPIC)}" target="_blank" rel="noreferrer">
          ntfy topic
        </a>
      </header>

      <section class="layout">
        <div class="stack">
          <article class="card hero-card">
            <div>
              <p class="section-label">Status</p>
              <div class="status-row">
                <div class="status-pill ${statusTone}">
                  <span class="dot" aria-hidden="true"></span>
                  <span>${escapeHtml(statusText)}</span>
                </div>
                <div class="tag">${escapeHtml(productName)}</div>
              </div>
            </div>

            <div class="metric-grid">
              <section class="metric">
                <p class="metric-label">Last Check</p>
                <p class="metric-value">${escapeHtml(lastCheckText)}</p>
              </section>
              <section class="metric">
                <p class="metric-label">Notifications</p>
                <p class="metric-value">
                  <a class="link" href="https://ntfy.sh/${escapeHtml(NTFY_TOPIC)}" target="_blank" rel="noreferrer">
                    ${escapeHtml(NTFY_TOPIC)}
                  </a>
                </p>
              </section>
            </div>
          </article>

          <article class="card">
            <p class="section-label">Product</p>
            <div class="metric-grid">
              <section class="metric">
                <p class="metric-label">URL</p>
                <p class="metric-value">
                  <a class="link" href="${escapeHtml(state.productUrl)}" target="_blank" rel="noreferrer">
                    ${escapeHtml(state.productUrl)}
                  </a>
                </p>
              </section>
              <section class="metric">
                <p class="metric-label">Current State</p>
                <p class="metric-value ${isInStock ? "" : "muted"}">${escapeHtml(statusText)}</p>
              </section>
            </div>
          </article>

          <article class="card">
            <p class="section-label">Last Error</p>
            <div class="error-box">${escapeHtml(state.lastError || "None")}</div>
          </article>
        </div>

        <aside class="stack">
          <article class="card">
            <p class="section-label">Update URL</p>
            <form method="POST" action="/url">
              <label for="product_url">Able Carry product URL</label>
              <input
                id="product_url"
                name="product_url"
                type="url"
                required
                value="${escapeHtml(state.productUrl)}"
                placeholder="${escapeHtml(DEFAULT_PRODUCT_URL)}"
              />
              <div class="actions">
                <button class="button" type="submit">Save URL</button>
                <a class="button-secondary" href="/check">Run Check Now</a>
              </div>
            </form>
          </article>
        </aside>
      </section>
    </main>
  </body>
</html>`);
}

async function handleUpdateUrl(request: Request, env: Env): Promise<Response> {
  const formData = await request.formData();
  const submittedUrl = String(formData.get("product_url") || "").trim();

  if (!submittedUrl) {
    return new Response("Missing product_url", { status: 400 });
  }

  let normalizedUrl: string;

  try {
    normalizedUrl = validateProductUrl(submittedUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid URL";
    return new Response(message, { status: 400 });
  }

  await env.STORE.put("product_url", normalizedUrl);
  await env.STORE.put("product_name", "");
  await env.STORE.put("notified", "false");
  await env.STORE.put("last_error", "");

  return Response.redirect(new URL("/", request.url).toString(), 302);
}

async function loadState(env: Env): Promise<State> {
  const [productUrl, productName, lastStatus, lastCheck, lastError, notified] =
    await Promise.all([
      env.STORE.get("product_url"),
      env.STORE.get("product_name"),
      env.STORE.get("last_status"),
      env.STORE.get("last_check"),
      env.STORE.get("last_error"),
      env.STORE.get("notified"),
    ]);

  return {
    productUrl: productUrl || DEFAULT_PRODUCT_URL,
    productName: productName || null,
    lastStatus: normalizeStockStatus(lastStatus),
    lastCheck: lastCheck || null,
    lastError: lastError || null,
    notified: notified === "true",
  };
}

async function runStockCheck(env: Env): Promise<"InStock" | "OutOfStock"> {
  const state = await loadState(env);
  const now = new Date().toISOString();

  try {
    const { availability: currentStatus, productName } = await fetchProductDetails(
      state.productUrl,
    );
    const nextNotified = currentStatus === "InStock";
    const shouldNotify =
      currentStatus === "InStock" && (!state.notified || state.lastStatus !== "InStock");

    await Promise.all([
      env.STORE.put("last_status", currentStatus),
      env.STORE.put("product_name", productName),
      env.STORE.put("last_check", now),
      env.STORE.put("last_error", ""),
      env.STORE.put("notified", String(nextNotified)),
    ]);

    if (shouldNotify) {
      await sendNotification(state.productUrl, productName);
    }

    return currentStatus;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await Promise.all([env.STORE.put("last_check", now), env.STORE.put("last_error", message)]);
    throw error;
  }
}

async function fetchProductDetails(productUrl: string): Promise<ProductDetails> {
  const response = await fetch(productUrl, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(`Product page request failed with ${response.status}`);
  }

  const html = await response.text();
  const productDetails = extractProductDetailsFromJsonLd(html);
  const { availability, productName } = productDetails;

  if (!availability) {
    throw new Error("Could not find offers.availability in JSON-LD");
  }

  if (!productName) {
    throw new Error("Could not find product name in JSON-LD");
  }

  return {
    availability: availability.includes("InStock") ? "InStock" : "OutOfStock",
    productName,
  };
}

function extractProductDetailsFromJsonLd(html: string): ProductSearchResult {
  const scriptRegex =
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(scriptRegex)) {
    const rawJson = match[1]?.trim();
    if (!rawJson) {
      continue;
    }

    try {
      const parsed = JSON.parse(rawJson) as JsonValue;
      const productDetails = findProductDetails(parsed);
      if (productDetails.availability && productDetails.productName) {
        return productDetails;
      }
    } catch {
      continue;
    }
  }

  return {
    availability: null,
    productName: null,
  };
}

function findProductDetails(node: JsonValue | undefined): ProductSearchResult {
  if (node == null) {
    return {
      availability: null,
      productName: null,
    };
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      const result = findProductDetails(item);
      if (result.availability && result.productName) {
        return result;
      }
    }

    return {
      availability: null,
      productName: null,
    };
  }

  if (typeof node !== "object") {
    return {
      availability: null,
      productName: null,
    };
  }

  let productName = typeof node.name === "string" ? node.name.trim() : null;
  let availability: string | null = null;
  const offers = node.offers;

  if (offers) {
    if (Array.isArray(offers)) {
      for (const offer of offers) {
        if (
          offer &&
          typeof offer === "object" &&
          !Array.isArray(offer) &&
          typeof offer.availability === "string"
        ) {
          availability = offer.availability;
          break;
        }
      }
    } else if (
      typeof offers === "object" &&
      !Array.isArray(offers) &&
      offers !== null &&
      typeof offers.availability === "string"
    ) {
      availability = offers.availability;
    }
  }

  if (availability && productName) {
    return { availability, productName };
  }

  for (const value of Object.values(node)) {
    const result = findProductDetails(value);
    if (!availability && result.availability) {
      availability = result.availability;
    }
    if (!productName && result.productName) {
      productName = result.productName;
    }
    if (availability && productName) {
      return { availability, productName };
    }
  }

  return { availability, productName };
}

async function sendNotification(productUrl: string, productName: string): Promise<void> {
  const response = await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
    method: "POST",
    headers: {
      Title: `Able Carry In Stock: ${productName}`,
      Priority: "urgent",
      Tags: "rotating_light",
    },
    body: `${productName} is back in stock.\n\n${productUrl}`,
  });

  if (!response.ok) {
    throw new Error(`ntfy notification failed with ${response.status}`);
  }
}

function validateProductUrl(input: string): string {
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    throw new Error("Invalid URL");
  }

  const isAbleCarryHost =
    url.hostname === "ablecarry.com" || url.hostname.endsWith(".ablecarry.com");
  const isProductPath = url.pathname.startsWith("/products/");

  if (!["http:", "https:"].includes(url.protocol) || !isAbleCarryHost || !isProductPath) {
    throw new Error("URL must be an Able Carry product page");
  }

  return url.toString();
}

function normalizeStockStatus(status: string | null): StockStatus {
  if (status === "InStock" || status === "OutOfStock") {
    return status;
  }

  return "Unknown";
}

function formatStockStatus(status: StockStatus): string {
  if (status === "OutOfStock") {
    return "Out of Stock";
  }

  if (status === "InStock") {
    return "In Stock";
  }

  return "Unknown";
}

function formatTimestamp(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

function htmlResponse(html: string): Response {
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}

function escapeHtml(value: string | null): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
