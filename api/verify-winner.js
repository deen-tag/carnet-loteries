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

  const { idToken, resto_id, drawId, code } = req.body || {};
  if (!idToken || !resto_id || !drawId || !code) {
    return res.status(400).json({ error: "idToken, resto_id, drawId et code sont requis" });
  }
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    return res.status(500).json({ error: "Clé de service Firebase non configurée sur Vercel" });
  }

  try {
    // même vérif de propriété que send-promo : seul le commerçant concerné
    // (ou le super-admin) peut confirmer un gagnant chez lui.
    const decoded = await admin.auth().verifyIdToken(idToken);
    const callerEmail = (decoded.email || "").toLowerCase();

    const db = admin.firestore();
    const restoSnap = await db.collection("restaurants").doc(resto_id).get();
    if (!restoSnap.exists) {
      return res.status(404).json({ error: "Commerçant introuvable." });
    }
    const r = restoSnap.data();

    if (callerEmail !== SUPER_ADMIN_EMAIL) {
      const isOwner = ("ownerUid" in r)
        ? r.ownerUid === decoded.uid
        : (r.ownerEmail || "").toLowerCase() === callerEmail;
      if (!isOwner) {
        return res.status(403).json({ error: "Tu n'es pas propriétaire de ce commerçant." });
      }
    }

    const drawRef = db.collection("draws").doc(drawId);
    const drawSnap = await drawRef.get();
    if (!drawSnap.exists) {
      return res.status(404).json({ error: "Tirage introuvable." });
    }
    const d = drawSnap.data();
    if (d.restaurantId !== resto_id) {
      return res.status(400).json({ error: "Ce tirage n'appartient pas à ce commerce." });
    }
    if (!d.winner || d.winner.code !== code) {
      return res.status(400).json({ ok: false, error: "invalid", message: "Code invalide pour ce commerce." });
    }
    if (d.winner.claimed) {
      return res.status(200).json({
        ok: false,
        error: "already_claimed",
        message: "Ce lot a déjà été réclamé.",
        prenom: d.winner.prenom,
        claimedAt: d.winner.claimedAt || null
      });
    }

    await drawRef.update({
      "winner.claimed": true,
      "winner.claimedAt": admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(200).json({ ok: true, prenom: d.winner.prenom, prize: d.prize || "" });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
