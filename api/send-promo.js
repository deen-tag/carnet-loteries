import admin from "firebase-admin";

const SUPER_ADMIN_EMAIL = "deentag.pro@gmail.com";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n")
    })
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const { idToken, external_ids, title, message, resto_id, origin, result } = req.body || {};
  if (!idToken || !resto_id) {
    return res.status(400).json({ error: "idToken et resto_id sont requis" });
  }
  if (!Array.isArray(external_ids) || external_ids.length === 0 || !title || !message) {
    return res.status(400).json({ error: "external_ids (liste non vide), title et message sont requis" });
  }
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    return res.status(500).json({ error: "Clé de service Firebase non configurée sur Vercel" });
  }

  let restoName = "";
  try {
    // Vérifie que l'appelant est authentifié ET propriétaire de ce commerçant
    // (ou super-admin), pour empêcher n'importe qui d'envoyer des pushs à
    // n'importe quel client via cette route.
    const decoded = await admin.auth().verifyIdToken(idToken);
    const callerEmail = (decoded.email || "").toLowerCase();

    const restoSnap = await admin.firestore().collection("restaurants").doc(resto_id).get();
    if (!restoSnap.exists) {
      return res.status(404).json({ error: "Commerçant introuvable." });
    }
    const r = restoSnap.data();
    restoName = r.name || "";

    if (callerEmail !== SUPER_ADMIN_EMAIL) {
      const isOwner = ("ownerUid" in r)
        ? r.ownerUid === decoded.uid
        : (r.ownerEmail || "").toLowerCase() === callerEmail;
      if (!isOwner) {
        return res.status(403).json({ error: "Tu n'es pas propriétaire de ce commerçant." });
      }
    }
  } catch (e) {
    return res.status(401).json({ error: "Session invalide, reconnecte-toi." });
  }

  // le nom du commerce est toujours ajouté devant le titre, pour que le
  // client sache de qui vient le message même s'il a participé chez
  // plusieurs commerces (le commerçant n'a pas à y penser lui-même).
  const fullTitle = restoName ? `${restoName} — ${title}` : title;

  const siteOrigin = origin || "https://tiketo.vercel.app";
  let targetUrl = siteOrigin;
  if (resto_id) {
    if (result === "win") targetUrl = `${siteOrigin}/?resto=${resto_id}&result=win`;
    else if (result === "lose") targetUrl = `${siteOrigin}/?resto=${resto_id}&result=lose`;
    else targetUrl = `${siteOrigin}/?resto=${resto_id}&promo=1`;
  }

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
          headings: { en: fullTitle, fr: fullTitle },
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
