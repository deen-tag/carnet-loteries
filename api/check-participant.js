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
  const { drawId, email } = req.body || {};
  if (!drawId || !email) {
    return res.status(400).json({ error: "drawId et email sont requis" });
  }
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    return res.status(500).json({ error: "Clé de service Firebase non configurée sur Vercel" });
  }
  try {
    const snap = await admin.firestore().collection("participants")
      .where("drawId", "==", drawId)
      .where("email", "==", email.trim().toLowerCase())
      .limit(1)
      .get();
    return res.status(200).json({ ok: true, exists: !snap.empty });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
