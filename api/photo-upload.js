// api/photo-upload.js
// Reçoit une photo (en base64) depuis l'app, la range dans le dossier Drive
// "Observations — Photos" > <sous-dossier de l'élève> (créé automatiquement s'il n'existe pas),
// et renvoie son lien de consultation.
//
// POST /api/photo-upload   body JSON:
//   { eleve: "Adel", filename: "photo.jpg", mimeType: "image/jpeg", base64: "...." }
//   -> { ok: true, link: "https://drive.google.com/..." }

const { getDriveClient } = require('./lib/google');
const { Readable } = require('stream');

async function findOrCreateStudentFolder(drive, parentId, studentName){
  const safeName = studentName.replace(/['"]/g, '');
  const q = `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and name='${safeName}' and trashed=false`;
  const existing = await drive.files.list({ q, fields: 'files(id, name)' });
  if (existing.data.files && existing.data.files.length > 0){
    return existing.data.files[0].id;
  }
  const created = await drive.files.create({
    requestBody: {
      name: studentName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    },
    fields: 'id'
  });
  return created.data.id;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS'){ res.status(200).end(); return; }
  if (req.method !== 'POST'){ res.status(405).json({ error: 'Méthode non supportée.' }); return; }

  const rootFolderId = process.env.PHOTOS_FOLDER_ID;
  if (!rootFolderId){
    res.status(500).json({ error: "PHOTOS_FOLDER_ID n'est pas configuré sur Vercel." });
    return;
  }

  const { eleve, filename, mimeType, base64 } = req.body || {};
  if (!eleve || !filename || !mimeType || !base64){
    res.status(400).json({ error: "Corps attendu : { eleve, filename, mimeType, base64 }" });
    return;
  }

  try{
    const drive = getDriveClient();
    const studentFolderId = await findOrCreateStudentFolder(drive, rootFolderId, eleve);

    const buffer = Buffer.from(base64, 'base64');
    const stream = Readable.from(buffer);

    const uploaded = await drive.files.create({
      requestBody: {
        name: filename,
        parents: [studentFolderId]
      },
      media: {
        mimeType,
        body: stream
      },
      fields: 'id, webViewLink'
    });

    // rend le fichier consultable via son lien (sans le rendre public sur le moteur de recherche)
    await drive.permissions.create({
      fileId: uploaded.data.id,
      requestBody: { role: 'reader', type: 'anyone' }
    });

    res.status(200).json({ ok: true, link: uploaded.data.webViewLink });
  }catch(e){
    res.status(500).json({ error: "Erreur d'upload Drive : " + e.message });
  }
};
