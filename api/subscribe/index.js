const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_HOSTS = ["brave-grass-019d47503.7.azurestaticapps.net"];

// Anti-abus basique en mémoire (par instance) : max 5 requêtes / 10 min / IP.
const hits = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_HITS = 5;

function isRateLimited(ip) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.start > WINDOW_MS) {
    hits.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_HITS;
}

function originAllowed(req) {
  const originHeader = req.headers.origin || req.headers.referer || "";
  if (!originHeader) return false;
  try {
    const host = new URL(originHeader).hostname;
    return ALLOWED_HOSTS.includes(host);
  } catch (e) {
    return false;
  }
}

module.exports = async function (context, req) {
  if (!originAllowed(req)) {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "origine_refusee" } };
    return;
  }

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (isRateLimited(ip)) {
    context.res = { status: 429, headers: { "Content-Type": "application/json" }, body: { error: "trop_de_requetes" } };
    return;
  }

  const body = req.body || {};

  // Honeypot : champ invisible que seuls les bots remplissent.
  if (typeof body.company === "string" && body.company.trim() !== "") {
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { ok: true } };
    return;
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const source = typeof body.source === "string" ? body.source.slice(0, 200) : "";
  const page = typeof body.page === "string" ? body.page.slice(0, 200) : "";

  if (!EMAIL_RE.test(email)) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "email_invalide" } };
    return;
  }

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    context.log.error("BREVO_API_KEY manquante");
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "configuration_manquante" } };
    return;
  }

  try {
    const brevoRes = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": apiKey,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        email,
        attributes: { SOURCE: source, PAGE: page },
        updateEnabled: true
      })
    });

    if (!brevoRes.ok && brevoRes.status !== 204) {
      const errText = await brevoRes.text();
      context.log.error("Brevo error", brevoRes.status, errText);
      context.res = { status: 502, headers: { "Content-Type": "application/json" }, body: { error: "brevo_error" } };
      return;
    }

    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { ok: true } };
  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "server_error" } };
  }
};
