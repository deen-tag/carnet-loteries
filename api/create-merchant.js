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

  const { idToken, name, ownerEmail, password, pseudo } = req.body || {};
  if (!idToken || !name || !ownerEmail || !password) {
    return res.status(400).json({ error: "idToken, name, ownerEmail et password sont requis" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Le mot de passe doit faire au moins 6 caractères." });
  }

  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    return res.status(500).json({ error: "Clé de service Firebase non configurée sur Vercel (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY manquants)" });
  }

  try {
    // vérifie que c'est bien le super-admin qui appelle, pas n'importe qui
    const decoded = await admin.auth().verifyIdToken(idToken);
    if ((decoded.email || "").toLowerCase() !== SUPER_ADMIN_EMAIL) {
      return res.status(403).json({ error: "Action réservée au propriétaire de la plateforme." });
    }

    const emailLower = ownerEmail.trim().toLowerCase();
    const userRecord = await admin.auth().createUser({ email: emailLower, password });

    const db = admin.firestore();
    const restoRef = await db.collection("restaurants").add({
      name,
      ownerEmail: emailLower,
      ownerUid: userRecord.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    if (pseudo && pseudo.trim()) {
      await db.collection("usernames").doc(pseudo.trim().toLowerCase()).set({ email: emailLower });
    }

    return res.status(200).json({ ok: true, restaurantId: restoRef.id, uid: userRecord.uid });
  } catch (e) {
    let msg = e?.message || String(e);
    if (e?.code === "auth/email-already-exists") msg = "Un compte existe déjà avec cet email.";
    return res.status(500).json({ error: msg });
  }
}
