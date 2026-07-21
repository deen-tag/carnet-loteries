export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const { resto_id, title, message } = req.body || {};
  if (!resto_id || !title || !message) {
    return res.status(400).json({ error: "resto_id, title et message sont requis" });
  }

  const REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;
  const APP_ID = "ed8e48a0-0f7c-44fb-8630-0e0a84eb9545";

  if (!REST_API_KEY) {
    return res.status(500).json({ error: "Clé API OneSignal non configurée sur Vercel (ONESIGNAL_REST_API_KEY manquante)" });
  }

  try {
    const r = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Key ${REST_API_KEY}`
      },
      body: JSON.stringify({
        app_id: APP_ID,
        headings: { en: title, fr: title },
        contents: { en: message, fr: message },
        filters: [
          { field: "tag", key: "resto_id", relation: "=", value: resto_id }
        ]
      })
    });

    const data = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({ error: data?.errors ? JSON.stringify(data.errors) : "Erreur OneSignal" });
    }
    return res.status(200).json({ ok: true, recipients: data.recipients ?? 0, id: data.id });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
