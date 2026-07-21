export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const { notification_id } = req.body || {};
  if (!notification_id) {
    return res.status(400).json({ error: "notification_id est requis" });
  }

  const REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;
  const APP_ID = "ed8e48a0-0f7c-44fb-8630-0e0a84eb9545";

  if (!REST_API_KEY) {
    return res.status(500).json({ error: "Clé API OneSignal non configurée sur Vercel (ONESIGNAL_REST_API_KEY manquante)" });
  }

  try {
    const r = await fetch(`https://api.onesignal.com/notifications/${notification_id}?app_id=${APP_ID}`, {
      headers: { "Authorization": `Key ${REST_API_KEY}` }
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return res.status(r.status).json({ error: data?.errors ? JSON.stringify(data.errors) : "Erreur OneSignal" });
    }
    // "successful" = nombre réel de livraisons confirmées côté OneSignal
    return res.status(200).json({
      ok: true,
      successful: typeof data.successful === "number" ? data.successful : null,
      failed: typeof data.failed === "number" ? data.failed : null,
      remaining: typeof data.remaining === "number" ? data.remaining : null
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
