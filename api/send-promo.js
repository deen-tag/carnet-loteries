export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const { external_ids, title, message, resto_id, origin } = req.body || {};
  if (!Array.isArray(external_ids) || external_ids.length === 0 || !title || !message) {
    return res.status(400).json({ error: "external_ids (liste non vide), title et message sont requis" });
  }

  const siteOrigin = origin || "https://tiketo.vercel.app";
  const targetUrl = resto_id ? `${siteOrigin}/?resto=${resto_id}&promo=1` : siteOrigin;

  const REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;
  const APP_ID = "ed8e48a0-0f7c-44fb-8630-0e0a84eb9545";

  if (!REST_API_KEY) {
    return res.status(500).json({ error: "Clé API OneSignal non configurée sur Vercel (ONESIGNAL_REST_API_KEY manquante)" });
  }

  // OneSignal limite à 2000 alias par appel — largement suffisant ici,
  // mais on découpe par sécurité si jamais la liste grossit beaucoup.
  const chunks = [];
  for (let i = 0; i < external_ids.length; i += 2000) chunks.push(external_ids.slice(i, i + 2000));

  try {
    let totalRecipients = 0;
    const ids = [];
    for (const chunk of chunks) {
      const r = await fetch("https://api.onesignal.com/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Key ${REST_API_KEY}`
        },
        body: JSON.stringify({
          app_id: APP_ID,
          target_channel: "push",
          headings: { en: title, fr: title },
          contents: { en: message, fr: message },
          url: targetUrl,
          chrome_web_icon: `${siteOrigin}/logo.png`,
          firefox_icon: `${siteOrigin}/logo.png`,
          // ciblage direct par identifiant externe (email) : pas besoin de
          // tags, donc aucun impact sur le quota de tags uniques du plan.
          include_aliases: { external_id: chunk },
          channel_for_external_user_ids: "push"
        })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        return res.status(r.status).json({ error: data?.errors ? JSON.stringify(data.errors) : "Erreur OneSignal" });
      }
      totalRecipients += (typeof data.recipients === "number" ? data.recipients : 0);
      if (data.id) ids.push(data.id);
    }
    return res.status(200).json({ ok: true, recipients: totalRecipients, targeted: external_ids.length, notification_ids: ids });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
