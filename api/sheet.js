// api/sheet.js
// Lecture et écriture génériques sur un onglet du Google Sheet de données.
//
// GET  /api/sheet?tab=Observations
//      -> { rows: [ [colA, colB, ...], ... ] }  (toutes les lignes, en-tête comprise)
//
// POST /api/sheet   body JSON: { tab: "Observations", row: ["2026-09-10", "Adel", "..."] }
//      -> ajoute une ligne à la fin de l'onglet indiqué
//      -> { ok: true }

const { getSheetsClient } = require('./lib/google');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS'){ res.status(200).end(); return; }

  const sheetId = process.env.SHEET_ID;
  if (!sheetId){
    res.status(500).json({ error: "SHEET_ID n'est pas configuré sur Vercel." });
    return;
  }

  try{
    const sheets = getSheetsClient();

    if (req.method === 'GET'){
      const tab = req.query.tab;
      if (!tab){ res.status(400).json({ error: "Paramètre 'tab' manquant." }); return; }
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `${tab}!A:Z`
      });
      res.status(200).json({ rows: result.data.values || [] });
      return;
    }

    if (req.method === 'POST'){
      const { tab, row } = req.body || {};
      if (!tab || !Array.isArray(row)){
        res.status(400).json({ error: "Corps attendu : { tab: string, row: string[] }" });
        return;
      }
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: `${tab}!A:Z`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [row] }
      });
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Méthode non supportée.' });
  }catch(e){
    res.status(500).json({ error: 'Erreur Google Sheets : ' + e.message });
  }
};
