const DEFAULT_PRODUCT_URL =
  "https://ablecarry.com/products/max-edc-earth-green?variant=51046764577080";
const NTFY_TOPIC = "ablecarry-stock-monitor";
const USER_AGENT = "Mozilla/5.0 (compatible; AbleCarryStockMonitor/1.0)";

export default {
  async fetch(request, env, ctx) {
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

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runStockCheck(env));
  },
};

async function handleDashboard(env) {
  const state = await loadState(env);
  const productName = getProductNameFromUrl(state.productUrl);
  const isInStock = state.lastStatus === "InStock";
  const lastCheckText = state.lastCheck
    ? formatTimestamp(state.lastCheck)
    : "Never";
  const statusText = state.lastStatus || "Unknown";

  return htmlResponse(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Able Carry Stock Monitor</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #091018;
        --bg-accent: #0f1a26;
        --card: rgba(18, 28, 40, 0.9);
        --border: rgba(255, 255, 255, 0.08);
        --text: #edf3f8;
        --muted: #93a4b8;
        --good: #27c46b;
        --bad: #ef5350;
        --input: #101b28;
        --button: #1f8f56;
        --button-hover: #29a965;
        --shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(39, 196, 107, 0.16), transparent 28%),
          radial-gradient(circle at top right, rgba(239, 83, 80, 0.12), transparent 24%),
          linear-gradient(180deg, #0a111a 0%, #091018 100%);
        color: var(--text);
        padding: 32px 16px 48px;
      }

      .container {
        max-width: 980px;
        margin: 0 auto;
      }

      .hero {
        margin-bottom: 20px;
      }

      .eyebrow {
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font-size: 12px;
        margin-bottom: 8px;
      }

      h1 {
        margin: 0;
        font-size: clamp(2rem, 4vw, 3rem);
      }

      .subtitle {
        color: var(--muted);
        margin-top: 12px;
        line-height: 1.5;
        max-width: 700px;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 16px;
      }

      .card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 20px;
        box-shadow: var(--shadow);
        backdrop-filter: blur(12px);
      }

      .card h2 {
        margin: 0 0 14px;
        font-size: 1rem;
        color: var(--muted);
        font-weight: 600;
      }

      .value {
        font-size: 1.1rem;
        line-height: 1.5;
        word-break: break-word;
      }

      .url {
        color: #c8f5da;
        text-decoration: none;
      }

      .url:hover {
        text-decoration: underline;
      }

      .status {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        font-size: 1.2rem;
        font-weight: 700;
      }

      .dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        box-shadow: 0 0 18px currentColor;
      }

      .good {
        color: var(--good);
      }

      .bad {
        color: var(--bad);
      }

      .muted {
        color: var(--muted);
      }

      .form-card {
        margin-top: 16px;
      }

      form {
        display: grid;
        gap: 14px;
      }

      label {
        color: var(--muted);
        font-size: 0.95rem;
      }

      input[type="url"] {
        width: 100%;
        padding: 14px 16px;
        border-radius: 12px;
        border: 1px solid var(--border);
        background: var(--input);
        color: var(--text);
        font: inherit;
      }

      input[type="url"]:focus {
        outline: 2px solid rgba(39, 196, 107, 0.35);
        border-color: rgba(39, 196, 107, 0.45);
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }

      button,
      .secondary-link {
        appearance: none;
        border: 0;
        border-radius: 12px;
        padding: 12px 18px;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
        text-decoration: none;
      }

      button {
        background: var(--button);
        color: #04120b;
      }

      button:hover {
        background: var(--button-hover);
      }

      .secondary-link {
        background: #162231;
        color: var(--text);
        border: 1px solid var(--border);
      }

      .secondary-link:hover {
        background: #1b2a3b;
      }

      .error {
        color: #ffb4b1;
        white-space: pre-wrap;
      }

      @media (max-width: 640px) {
        body {
          padding-top: 24px;
        }

        .card {
          padding: 18px;
        }

        .actions {
          flex-direction: column;
        }

        button,
        .secondary-link {
          text-align: center;
          width: 100%;
        }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <section class="hero">
        <div class="eyebrow">Cloudflare Worker Dashboard</div>
        <h1>Able Carry Stock Monitor</h1>
        <p class="subtitle">
          Monitors one Able Carry product page, stores state in Cloudflare KV, and sends an urgent
          <code>ntfy.sh</code> alert only when availability flips back to <code>InStock</code>.
        </p>
      </section>

      <section class="grid">
        <article class="card">
          <h2>Monitored Product URL</h2>
          <div class="value">
            <a class="url" href="${escapeHtml(state.productUrl)}" target="_blank" rel="noreferrer">
              ${escapeHtml(state.productUrl)}
            </a>
          </div>
        </article>

        <article class="card">
          <h2>Product Name</h2>
          <div class="value">${escapeHtml(productName)}</div>
        </article>

        <article class="card">
          <h2>Current Stock Status</h2>
          <div class="status ${isInStock ? "good" : "bad"}">
            <span class="dot" aria-hidden="true"></span>
            <span>${escapeHtml(statusText)}</span>
          </div>
        </article>

        <article class="card">
          <h2>Last Check</h2>
          <div class="value">${escapeHtml(lastCheckText)}</div>
        </article>

        <article class="card" style="grid-column: 1 / -1;">
          <h2>Last Error</h2>
          <div class="value ${state.lastError ? "error" : "muted"}">
            ${escapeHtml(state.lastError || "None")}
          </div>
        </article>
      </section>

      <section class="card form-card">
        <h2>Change Monitored URL</h2>
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
            <button type="submit">Save URL</button>
            <a class="secondary-link" href="/check">Run Check Now</a>
          </div>
        </form>
      </section>
    </div>
  </body>
</html>`);
}

async function handleUpdateUrl(request, env) {
  const formData = await request.formData();
  const submittedUrl = String(formData.get("product_url") || "").trim();

  if (!submittedUrl) {
    return new Response("Missing product_url", { status: 400 });
  }

  let normalizedUrl;

  try {
    normalizedUrl = validateProductUrl(submittedUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid URL";
    return new Response(message, { status: 400 });
  }

  await env.STORE.put("product_url", normalizedUrl);
  await env.STORE.put("notified", "false");
  await env.STORE.put("last_error", "");

  return Response.redirect(new URL("/", request.url).toString(), 302);
}

async function loadState(env) {
  const [productUrl, lastStatus, lastCheck, lastError, notified] =
    await Promise.all([
      env.STORE.get("product_url"),
      env.STORE.get("last_status"),
      env.STORE.get("last_check"),
      env.STORE.get("last_error"),
      env.STORE.get("notified"),
    ]);

  return {
    productUrl: productUrl || DEFAULT_PRODUCT_URL,
    lastStatus: lastStatus || "OutOfStock",
    lastCheck: lastCheck || null,
    lastError: lastError || null,
    notified: notified === "true",
  };
}

async function runStockCheck(env) {
  const state = await loadState(env);
  const now = new Date().toISOString();

  try {
    const currentStatus = await fetchAvailability(state.productUrl);
    const nextNotified =
      currentStatus === "InStock" ? true : false;
    const shouldNotify =
      currentStatus === "InStock" &&
      (!state.notified || state.lastStatus !== "InStock");

    await Promise.all([
      env.STORE.put("last_status", currentStatus),
      env.STORE.put("last_check", now),
      env.STORE.put("last_error", ""),
      env.STORE.put("notified", String(nextNotified)),
    ]);

    if (shouldNotify) {
      await sendNotification(state.productUrl, getProductNameFromUrl(state.productUrl));
    }

    return currentStatus;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await Promise.all([
      env.STORE.put("last_check", now),
      env.STORE.put("last_error", message),
    ]);
    throw error;
  }
}

async function fetchAvailability(productUrl) {
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
  const availability = extractAvailabilityFromJsonLd(html);

  if (!availability) {
    throw new Error("Could not find offers.availability in JSON-LD");
  }

  return availability.includes("InStock") ? "InStock" : "OutOfStock";
}

function extractAvailabilityFromJsonLd(html) {
  const scriptRegex =
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(scriptRegex)) {
    const rawJson = match[1]?.trim();
    if (!rawJson) {
      continue;
    }

    try {
      const parsed = JSON.parse(rawJson);
      const availability = findAvailability(parsed);
      if (availability) {
        return availability;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function findAvailability(node) {
  if (!node) {
    return null;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      const result = findAvailability(item);
      if (result) {
        return result;
      }
    }
    return null;
  }

  if (typeof node !== "object") {
    return null;
  }

  const offers = node.offers;
  if (offers) {
    if (Array.isArray(offers)) {
      for (const offer of offers) {
        if (offer && typeof offer === "object" && typeof offer.availability === "string") {
          return offer.availability;
        }
      }
    } else if (typeof offers === "object" && typeof offers.availability === "string") {
      return offers.availability;
    }
  }

  for (const value of Object.values(node)) {
    const result = findAvailability(value);
    if (result) {
      return result;
    }
  }

  return null;
}

async function sendNotification(productUrl, productName) {
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

function validateProductUrl(input) {
  let url;

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

function getProductNameFromUrl(productUrl) {
  try {
    const url = new URL(productUrl);
    const slug = url.pathname.split("/").filter(Boolean).pop() || "unknown-product";

    return slug
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  } catch {
    return "Unknown Product";
  }
}

function formatTimestamp(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

function htmlResponse(html) {
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
