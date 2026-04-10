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
  TOTP_SECRET: string;
}

interface RateLimitState {
  failures: number;
  lockedUntil: number;
}

type StockStatus = "InStock" | "OutOfStock" | "Unknown";

interface State {
  productUrl: string;
  productName: string | null;
  productImage: string | null;
  lastStatus: StockStatus;
  lastCheck: string | null;
  lastInStock: string | null;
  lastError: string | null;
  notified: boolean;
}

interface ProductDetails {
  availability: "InStock" | "OutOfStock";
  productName: string;
  productImage: string | null;
}

interface ProductSearchResult {
  availability: string | null;
  productName: string | null;
  productImage: string | null;
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
      return handleDashboard(request, env);
    }

    if (request.method === "POST" && url.pathname === "/url") {
      return handleUpdateUrl(request, env);
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

async function handleDashboard(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const state = await loadState(env);
  const formError = url.searchParams.get("error");
  const productName = state.productName || "Unknown Product";
  const productUrlDisplay = formatProductUrlForDisplay(state.productUrl);
  const productImageMarkup = state.productImage
    ? `<img
        class="product-thumbnail"
        src="${escapeHtml(state.productImage)}"
        alt="${escapeHtml(productName)}"
        loading="lazy"
      />`
    : "";
  const statusText = formatStockStatus(state.lastStatus);
  const statusTone = state.lastStatus === "InStock" ? "status-live" : "status-idle";
  const lastCheckMarkup = renderLocalTime(state.lastCheck);
  const lastInStockMarkup = renderLocalTime(state.lastInStock);

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
        align-items: center;
        justify-content: flex-end;
        gap: 20px;
        margin-bottom: 28px;
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
        color: #fe4b03;
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

      .product-panel {
        display: flex;
        align-items: center;
        gap: 16px;
      }

      .product-image-wrap {
        display: flex;
        flex-shrink: 0;
      }

      .product-thumbnail {
        width: 96px;
        height: 96px;
        object-fit: cover;
        border-radius: 16px;
        border: 1px solid rgba(148, 163, 184, 0.16);
        background: rgba(15, 23, 42, 0.45);
      }

      .product-panel .metric {
        flex: 1;
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

      .topic-link {
        position: relative;
        display: inline-block;
        padding-right: 2px;
        overflow: hidden;
        text-decoration: none;
      }

      .topic-link::after {
        content: "";
        position: absolute;
        left: -20%;
        bottom: -2px;
        width: 120%;
        height: 2px;
        border-radius: 999px;
        background: linear-gradient(90deg, transparent, var(--accent), transparent);
        transform: translateX(-120%);
        opacity: 0;
      }

      .topic-link:hover {
        text-decoration: none;
        text-shadow: 0 0 16px rgba(94, 235, 212, 0.28);
      }

      .topic-link:hover::after {
        opacity: 1;
        animation: topic-link-sweep 650ms ease-out forwards;
      }

      @keyframes topic-link-sweep {
        from {
          transform: translateX(-120%);
        }

        to {
          transform: translateX(120%);
        }
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

      input[type="text"] {
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

      input[type="text"]:focus {
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
        gap: 8px;
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

      .form-error {
        padding: 14px 16px;
        border-radius: 14px;
        border: 1px solid rgba(251, 113, 133, 0.2);
        background: rgba(127, 29, 29, 0.3);
        color: #fecdd3;
        line-height: 1.5;
      }

      .form-error-inline {
        margin-top: -6px;
      }

      input[aria-invalid="true"] {
        border-color: rgba(251, 113, 133, 0.45);
        box-shadow: 0 0 0 4px rgba(251, 113, 133, 0.12);
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

        .product-thumbnail {
          width: 100%;
          max-width: 140px;
          height: auto;
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
                <p class="metric-value">${lastCheckMarkup}</p>
              </section>
              <section class="metric">
                <p class="metric-label">Ntfy Topic</p>
                <p class="metric-value">
                  <a class="link topic-link" href="https://ntfy.sh/${escapeHtml(NTFY_TOPIC)}" target="_blank" rel="noreferrer">
                    ${escapeHtml(NTFY_TOPIC)}
                  </a>
                </p>
              </section>
            </div>
          </article>

          <article class="card">
            <p class="section-label">Product</p>
            <div class="product-panel">
              <section class="metric">
                <p class="metric-label">URL</p>
                <p class="metric-value">
                  <a class="link" href="${escapeHtml(state.productUrl)}" target="_blank" rel="noreferrer">
                    ${escapeHtml(productUrlDisplay)}
                  </a>
                </p>
              </section>
              ${
                productImageMarkup
                  ? `<div class="product-image-wrap">
                ${productImageMarkup}
              </div>`
                  : ""
              }
            </div>
          </article>

          <article class="card">
            <p class="section-label">Last Error</p>
            <div class="error-box">${escapeHtml(state.lastError || "None")}</div>
          </article>
        </div>

        <aside class="stack">
          <article class="card">
            <p class="section-label">Last In Stock</p>
            <section class="metric">
              <p class="metric-value">${lastInStockMarkup}</p>
            </section>
          </article>

          <article class="card">
            <p class="section-label">Update URL</p>
            <form method="POST" action="/url">
              ${
                formError
                  ? `<div class="form-error" role="alert">${escapeHtml(formError)}</div>`
                  : ""
              }
              <label for="product_url">Able Carry Product URL</label>
              <input
                id="product_url"
                name="product_url"
                type="url"
                required
                value="${escapeHtml(state.productUrl)}"
                data-current-url="${escapeHtml(state.productUrl)}"
                autocomplete="off"
                placeholder="${escapeHtml(DEFAULT_PRODUCT_URL)}"
              />
              <label for="shared_totp_code">TOTP Code</label>
              <input
                id="shared_totp_code"
                name="totp_code"
                type="text"
                inputmode="numeric"
                pattern="[0-9]{6}"
                minlength="6"
                maxlength="6"
                required
                autocomplete="one-time-code"
                placeholder="123456"
                ${formError ? 'aria-invalid="true" aria-describedby="shared_totp_code_error"' : ""}
              />
              ${
                formError
                  ? `<div
                id="shared_totp_code_error"
                class="form-error form-error-inline"
                role="alert"
              >${escapeHtml(formError)}</div>`
                  : ""
              }
              <div class="actions">
                <button class="button" type="submit">Save URL</button>
              </div>
            </form>
          </article>
        </aside>
      </section>
    </main>
    <script>
      (() => {
        const productUrlInput = document.querySelector('#product_url');

        const resetProductUrlInput = () => {
          if (!(productUrlInput instanceof HTMLInputElement)) {
            return;
          }

          const currentUrl = productUrlInput.dataset.currentUrl;
          if (!currentUrl) {
            return;
          }

          productUrlInput.value = currentUrl;
        };

        resetProductUrlInput();
        window.addEventListener('pageshow', resetProductUrlInput);
        document.querySelectorAll('time[data-local]').forEach((element) => {
          if (!(element instanceof HTMLTimeElement)) {
            return;
          }

          const iso = element.getAttribute('datetime');
          if (!iso) {
            return;
          }

          const date = new Date(iso);
          if (Number.isNaN(date.getTime())) {
            return;
          }

          element.textContent = date.toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'medium',
            timeZoneName: 'short',
          });
        });
      })();
    </script>
  </body>
</html>`);
}

async function handleUpdateUrl(request: Request, env: Env): Promise<Response> {
  const csrfError = validateSameOriginRequest(request);
  if (csrfError) {
    return csrfError;
  }

  const formData = await request.formData();
  const submittedUrl = String(formData.get("product_url") || "").trim();
  const totpCode = String(formData.get("totp_code") || "").trim();

  if (!submittedUrl) {
    return new Response("Missing product_url", { status: 400 });
  }

  if (!/^\d{6}$/.test(totpCode)) {
    return redirectWithError(request, "Invalid TOTP code");
  }

  let normalizedUrl: string;

  try {
    normalizedUrl = validateProductUrl(submittedUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid URL";
    return new Response(message, { status: 400 });
  }

  const rateLimitError = await enforceTotpRateLimit(request, env);
  if (rateLimitError) {
    return rateLimitError;
  }

  const isTotpValid = await validateTOTP(env.TOTP_SECRET, totpCode);

  if (!isTotpValid) {
    await recordFailedTotpAttempt(request, env);
    return redirectWithError(request, "Invalid TOTP code");
  }

  await clearFailedTotpAttempts(request, env);
  const state = await loadState(env);
  const next: State = {
    ...state,
    productUrl: normalizedUrl,
    productName: null,
    productImage: null,
    lastError: null,
    notified: false,
  };
  try {
    await runStockCheck(env, next);
  } catch {
    // Errors are persisted in KV for the dashboard to display.
  }

  return Response.redirect(new URL("/", request.url).toString(), 302);
}

async function loadState(env: Env): Promise<State> {
  const stored = await env.STORE.get("state");
  return parseState(stored);
}

async function runStockCheck(
  env: Env,
  stateOverride?: State,
): Promise<"InStock" | "OutOfStock"> {
  const state = stateOverride ?? (await loadState(env));
  const now = new Date().toISOString();

  try {
    const { availability: currentStatus, productName, productImage } = await fetchProductDetails(
      state.productUrl,
    );
    const shouldNotify =
      currentStatus === "InStock" && (!state.notified || state.lastStatus !== "InStock");
    const next: State = {
      ...state,
      productName,
      productImage,
      lastStatus: currentStatus,
      lastCheck: now,
      lastInStock: currentStatus === "InStock" ? now : state.lastInStock,
      lastError: null,
      notified: currentStatus === "InStock",
    };

    await env.STORE.put("state", JSON.stringify(next));

    if (shouldNotify) {
      await sendNotification(state.productUrl, productName);
    }

    return currentStatus;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const next: State = {
      ...state,
      lastCheck: now,
      lastError: message,
    };
    await env.STORE.put("state", JSON.stringify(next));
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
  const { availability, productName, productImage } = productDetails;

  if (!availability) {
    throw new Error("Could not find offers.availability in JSON-LD");
  }

  if (!productName) {
    throw new Error("Could not find product name in JSON-LD");
  }

  return {
    availability: availability.includes("InStock") ? "InStock" : "OutOfStock",
    productName,
    productImage,
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
    productImage: null,
  };
}

function findProductDetails(node: JsonValue | undefined): ProductSearchResult {
  if (node == null) {
    return {
      availability: null,
      productName: null,
      productImage: null,
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
      productImage: null,
    };
  }

  if (typeof node !== "object") {
    return {
      availability: null,
      productName: null,
      productImage: null,
    };
  }

  let productName = typeof node.name === "string" ? node.name.trim() : null;
  let availability: string | null = null;
  let productImage = extractImageUrl(node.image);
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
    return { availability, productName, productImage };
  }

  for (const value of Object.values(node)) {
    const result = findProductDetails(value);
    if (!availability && result.availability) {
      availability = result.availability;
    }
    if (!productName && result.productName) {
      productName = result.productName;
    }
    if (!productImage && result.productImage) {
      productImage = result.productImage;
    }
    if (availability && productName) {
      return { availability, productName, productImage };
    }
  }

  return { availability, productName, productImage };
}

function extractImageUrl(value: JsonValue | undefined): string | null {
  if (typeof value === "string") {
    const imageUrl = value.trim();
    return imageUrl.length > 0 ? imageUrl : null;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const imageUrl = extractImageUrl(entry);
      if (imageUrl) {
        return imageUrl;
      }
    }

    return null;
  }

  if (value && typeof value === "object") {
    const candidate =
      typeof value.url === "string"
        ? value.url
        : typeof value.contentUrl === "string"
          ? value.contentUrl
          : null;

    return candidate && candidate.trim().length > 0 ? candidate.trim() : null;
  }

  return null;
}

async function sendNotification(productUrl: string, productName: string): Promise<void> {
  const response = await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
    method: "POST",
    headers: {
      Title: `Able Carry In Stock: ${productName}`,
      Priority: "max",
      Tags: "rotating_light",
    },
    body: `${productName} is back in stock.\n\n${productUrl}`,
  });

  if (!response.ok) {
    throw new Error(`ntfy notification failed with ${response.status}`);
  }
}

function base32Decode(input: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = input.toUpperCase().replace(/[\s=]+/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of normalized) {
    const index = alphabet.indexOf(char);
    if (index === -1) {
      throw new Error("Invalid base32 secret");
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }

  return new Uint8Array(bytes);
}

async function generateTOTP(secret: string, counter: number): Promise<string> {
  const secretBytes = base32Decode(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const counterBytes = new ArrayBuffer(8);
  const counterView = new DataView(counterBytes);
  const high = Math.floor(counter / 2 ** 32);
  const low = counter >>> 0;
  counterView.setUint32(0, high, false);
  counterView.setUint32(4, low, false);

  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytes));
  const offset = signature[signature.length - 1] & 0x0f;
  const binary =
    ((signature[offset] & 0x7f) << 24) |
    ((signature[offset + 1] & 0xff) << 16) |
    ((signature[offset + 2] & 0xff) << 8) |
    (signature[offset + 3] & 0xff);
  const otp = binary % 1_000_000;

  return otp.toString().padStart(6, "0");
}

async function validateTOTP(secret: string, code: string): Promise<boolean> {
  const currentCounter = Math.floor(Date.now() / 1000 / 30);

  for (let offset = -1; offset <= 1; offset += 1) {
    const expected = await generateTOTP(secret, currentCounter + offset);
    if (constantTimeEqual(expected, code)) {
      return true;
    }
  }

  return false;
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let result = 0;

  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return result === 0;
}

function validateSameOriginRequest(request: Request): Response | null {
  const requestUrl = new URL(request.url);
  const expectedOrigin = requestUrl.origin;
  const origin = request.headers.get("Origin");
  const referer = request.headers.get("Referer");

  if (origin) {
    if (origin !== expectedOrigin) {
      return new Response("Forbidden", { status: 403 });
    }

    return null;
  }

  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (refererUrl.origin === expectedOrigin) {
        return null;
      }
    } catch {
      return new Response("Forbidden", { status: 403 });
    }
  }

  return new Response("Forbidden", { status: 403 });
}

function getClientIdentifier(request: Request): string {
  const forwardedIp = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For");
  const ip = forwardedIp?.split(",")[0]?.trim();

  return ip && ip.length > 0 ? ip : "unknown";
}

function getTotpRateLimitKey(request: Request): string {
  return `totp_rate_limit:${getClientIdentifier(request)}`;
}

async function getTotpRateLimitState(request: Request, env: Env): Promise<RateLimitState> {
  const stored = await env.STORE.get(getTotpRateLimitKey(request));

  if (!stored) {
    return { failures: 0, lockedUntil: 0 };
  }

  try {
    const parsed = JSON.parse(stored) as Partial<RateLimitState>;
    return {
      failures: typeof parsed.failures === "number" ? parsed.failures : 0,
      lockedUntil: typeof parsed.lockedUntil === "number" ? parsed.lockedUntil : 0,
    };
  } catch {
    return { failures: 0, lockedUntil: 0 };
  }
}

async function enforceTotpRateLimit(request: Request, env: Env): Promise<Response | null> {
  const state = await getTotpRateLimitState(request, env);

  if (state.lockedUntil > Date.now()) {
    return redirectWithError(request, "Too many failed TOTP attempts. Try again later.");
  }

  return null;
}

async function recordFailedTotpAttempt(request: Request, env: Env): Promise<void> {
  const now = Date.now();
  const state = await getTotpRateLimitState(request, env);
  const activeFailures = state.lockedUntil > now || state.lockedUntil === 0 ? state.failures : 0;
  const failures = activeFailures + 1;
  const nextState: RateLimitState = {
    failures,
    lockedUntil: failures >= 5 ? now + 15 * 60 * 1000 : 0,
  };

  await env.STORE.put(getTotpRateLimitKey(request), JSON.stringify(nextState));
}

async function clearFailedTotpAttempts(request: Request, env: Env): Promise<void> {
  await env.STORE.put(
    getTotpRateLimitKey(request),
    JSON.stringify({ failures: 0, lockedUntil: 0 } satisfies RateLimitState),
  );
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

function formatProductUrlForDisplay(input: string): string {
  try {
    const url = new URL(input);
    return `${url.host}${url.pathname}`.replace(/\/$/, "");
  } catch {
    return input;
  }
}

function parseState(value: string | null): State {
  if (!value) {
    return defaultState();
  }

  try {
    const parsed = JSON.parse(value) as Partial<State>;
    return {
      productUrl:
        typeof parsed.productUrl === "string" && parsed.productUrl.length > 0
          ? parsed.productUrl
          : DEFAULT_PRODUCT_URL,
      productName: typeof parsed.productName === "string" ? parsed.productName : null,
      productImage: typeof parsed.productImage === "string" ? parsed.productImage : null,
      lastStatus: normalizeStockStatus(
        typeof parsed.lastStatus === "string" ? parsed.lastStatus : null,
      ),
      lastCheck: typeof parsed.lastCheck === "string" ? parsed.lastCheck : null,
      lastInStock: typeof parsed.lastInStock === "string" ? parsed.lastInStock : null,
      lastError: typeof parsed.lastError === "string" ? parsed.lastError : null,
      notified: parsed.notified === true,
    };
  } catch {
    return defaultState();
  }
}

function defaultState(): State {
  return {
    productUrl: DEFAULT_PRODUCT_URL,
    productName: null,
    productImage: null,
    lastStatus: "Unknown",
    lastCheck: null,
    lastInStock: null,
    lastError: null,
    notified: false,
  };
}

function renderLocalTime(value: string | null): string {
  if (!value) {
    return "Never";
  }

  const date = new Date(value);
  const fallback = Number.isNaN(date.getTime()) ? value : date.toUTCString();
  return `<time datetime="${escapeHtml(value)}" data-local>${escapeHtml(fallback)}</time>`;
}

function htmlResponse(html: string): Response {
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; img-src 'self' data: https://ablecarry.com https://cdn.shopify.com; connect-src https://ntfy.sh https://ablecarry.com",
      "referrer-policy": "same-origin",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
    },
  });
}

function redirectWithError(request: Request, message: string): Response {
  const redirectUrl = new URL("/", request.url);
  redirectUrl.searchParams.set("error", message);
  return Response.redirect(redirectUrl.toString(), 302);
}

function escapeHtml(value: string | null): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
