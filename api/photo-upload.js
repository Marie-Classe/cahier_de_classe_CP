// api/photo-upload.js
// Reçoit une photo ou un audio (en base64) depuis l'app et le transmet à un script Google
// Apps Script qui l'enregistre dans TON Drive : dossier racine > sous-dossier de l'élève
// (créé automatiquement). Renvoie le lien du fichier.
//
// (Un compte de service Google n'a aucun espace de stockage Drive : il ne peut pas créer de
// fichier. Le script Apps Script, lui, s'exécute avec ton compte et utilise ton espace.)
//
// Variables d'environnement Vercel :
//   APPS_SCRIPT_URL     adresse du déploiement Apps Script (se termine par /exec)
//   APPS_SCRIPT_SECRET  le même mot de passe que la constante SECRET du script
//
// POST /api/photo-upload   body JSON:
//   { eleve: "Adel", filename: "photo.jpg", mimeType: "image/jpeg", base64: "...." }
//   -> { ok: true, link: "https://drive.google.com/..." }

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS'){ res.status(200).end(); return; }
  if (req.method !== 'POST'){ res.status(405).json({ error: 'Méthode non supportée.' }); return; }

  const scriptUrl = process.env.APPS_SCRIPT_URL;
  const secret = process.env.APPS_SCRIPT_SECRET;
  if (!scriptUrl || !secret){
    res.status(500).json({ error: "APPS_SCRIPT_URL ou APPS_SCRIPT_SECRET n'est pas configuré sur Vercel." });
    return;
  }

  const { eleve, filename, mimeType, base64 } = req.body || {};
  if (!eleve || !filename || !mimeType || !base64){
    res.status(400).json({ error: "Corps attendu : { eleve, filename, mimeType, base64 }" });
    return;
  }

  try{
    const resp = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret, eleve, filename, mimeType, base64 }),
      redirect: 'follow'
    });
    const text = await resp.text();
    let data;
    try{ data = JSON.parse(text); }
    catch(e){
      res.status(502).json({ error: "Réponse inattendue du script Google (déploiement mal réglé ? il doit être « Exécuter en tant que : moi » et accessible à « Tout le monde »)." });
      return;
    }
    if (!data.ok){
      res.status(502).json({ error: "Erreur d'upload Drive : " + (data.error || 'inconnue') });
      return;
    }
    res.status(200).json({ ok: true, link: data.link });
  }catch(e){
    res.status(500).json({ error: "Erreur d'upload Drive : " + e.message });
  }
};
