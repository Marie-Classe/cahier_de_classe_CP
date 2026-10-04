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
//   CODES_ELEVES        les codes secrets des élèves, au format JSON : {"Arielle":"157","Augustin":"042", ...}
//                       (chiffres 0 à 8 = les 9 images du code ; à générer avec codes.html).
//                       Sans cette variable, la page des élèves est bloquée.
//
// POST /api/photo-upload   body JSON (vérification du code d'un élève) :
//   { action: "check", eleve: "Adel", code: "157" }  -> { ok: true }  ou 401 si le code est faux
//
// POST /api/photo-upload   body JSON:
//   { eleve: "Adel", filename: "photo.jpg", mimeType: "image/jpeg", base64: "....", source?: "eleve" }
//   -> { ok: true, link: "https://drive.google.com/..." }

// Seuls ces prénoms sont acceptés : cela évite qu'une page appelant cette adresse crée
// des dossiers au nom de n'importe qui. À tenir à jour avec la liste des élèves.
const ELEVES = ["Arielle","Augustin","Aurélien","Charlie","Charly","Eden","Eris","Hank","Ilan","Iris","Isaiah","Louis","Lyam","Léa","Maël","Nella","Octavia","Olympe","Pablo","Raphaël","Tessa","Thaïs","Thibault","Théo","Yoko","Yüna","Zélie"]
  .map(n => n.normalize('NFC'));

const crypto = require('crypto');

// Codes secrets des élèves (variable d'environnement CODES_ELEVES), clés normalisées.
function loadCodes(){
  try{
    const raw = JSON.parse(process.env.CODES_ELEVES || '');
    const out = {};
    Object.keys(raw).forEach(k => { out[k.normalize('NFC')] = String(raw[k]); });
    return out;
  }catch(e){ return null; }
}
function codeIsValid(codes, eleve, code){
  const expected = codes[String(eleve).normalize('NFC')];
  if (!expected || typeof code !== 'string') return false;
  const a = Buffer.from(expected), b = Buffer.from(code);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS'){ res.status(200).end(); return; }
  if (req.method !== 'POST'){ res.status(405).json({ error: 'Méthode non supportée.' }); return; }

  // ---- Code secret des élèves ----
  const bodyIn = req.body || {};
  const fromStudentPage = bodyIn.source === 'eleve';
  if (bodyIn.action === 'check' || fromStudentPage){
    if (!ELEVES.includes(String(bodyIn.eleve || '').normalize('NFC'))){
      res.status(400).json({ error: `Prénom inconnu : « ${bodyIn.eleve} ».` });
      return;
    }
    const codes = loadCodes();
    if (!codes){
      res.status(500).json({ error: "CODES_ELEVES n'est pas configuré sur Vercel (voir codes.html)." });
      return;
    }
    if (!codeIsValid(codes, bodyIn.eleve, bodyIn.code)){
      res.status(401).json({ error: 'Code incorrect.' });
      return;
    }
    if (bodyIn.action === 'check'){ res.status(200).json({ ok: true }); return; }
  }

  const scriptUrl = process.env.APPS_SCRIPT_URL;
  const secret = process.env.APPS_SCRIPT_SECRET;
  if (!scriptUrl || !secret){
    res.status(500).json({ error: "APPS_SCRIPT_URL ou APPS_SCRIPT_SECRET n'est pas configuré sur Vercel." });
    return;
  }

  const { eleve, filename, mimeType, base64, source } = req.body || {};
  if (!eleve || !filename || !mimeType || !base64){
    res.status(400).json({ error: "Corps attendu : { eleve, filename, mimeType, base64 }" });
    return;
  }

  if (!ELEVES.includes(String(eleve).normalize('NFC'))){
    res.status(400).json({ error: `Prénom inconnu : « ${eleve} ». Ajoute-le à la liste ELEVES de api/photo-upload.js.` });
    return;
  }

  try{
    const resp = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      // source = 'eleve' : envoi fait par l'élève avec la tablette de classe (rangé à part)
      body: JSON.stringify({ secret, eleve, filename, mimeType, base64, source: source === 'eleve' ? 'eleve' : '' }),
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
