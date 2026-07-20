const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async function (context, req) {
  const body = req.body || {};
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
