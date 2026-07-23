import admin from "firebase-admin";

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

  const { external_id, tags } = req.body || {};
  if (!external_id || !tags || typeof tags !== "object") {
    return res.status(400).json({ error: "external_id et tags sont requis" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(external_id)) {
    return res.status(400).json({ error: "external_id doit être une adresse email valide" });
  }
  // Cette route est appelée par le client final (pas un commerçant connecté),
  // donc pas de vérif d'idToken possible ici. On limite quand même les
  // dégâts : le tag ne peut viser qu'un commerce qui existe vraiment.
  if (tags.resto_id) {
    try {
      const restoSnap = await admin.firestore().collection("restaurants").doc(String(tags.resto_id)).get();
      if (!restoSnap.exists) {
        return res.status(404).json({ error: "Commerçant introuvable." });
      }
    } catch (e) {
      return res.status(500).json({ error: "Vérification du commerçant impossible." });
    }
  }

  const REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;
  const APP_ID = "ed8e48a0-0f7c-44fb-8630-0e0a84eb9545";

  if (!REST_API_KEY) {
    return res.status(500).json({ error: "Clé API OneSignal non configurée sur Vercel (ONESIGNAL_REST_API_KEY manquante)" });
  }

  try {
    // On pose les tags directement depuis le serveur via l'API REST OneSignal,
    // plus fiable que le SDK client (dont l'envoi des tags peut se perdre en
    // silence si la page se ferme avant la fin de la synchronisation interne).
    const url = `https://api.onesignal.com/apps/${APP_ID}/users/by/external_id/${encodeURIComponent(external_id)}`;
    const r = await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Key ${REST_API_KEY}`
      },
      body: JSON.stringify({ properties: { tags } })
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return res.status(r.status).json({ error: data?.errors ? JSON.stringify(data.errors) : "Erreur OneSignal", detail: data });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
