// api/sheet.js
// Lecture et écriture génériques sur un onglet du Google Sheet de données.
//
// GET  /api/sheet?tab=Observations
//      -> { rows: [ [colA, colB, ...], ... ] }  (toutes les lignes, en-tête comprise)
//
// POST /api/sheet   body JSON: { tab: "Observations", row: [...] }
//      -> ajoute une ligne à la fin de l'onglet (journal, pas de mise à jour)
//
// POST /api/sheet   body JSON: { tab: "Évaluation", row: [...], matchColumns: [0,3,4] }
//      -> cherche une ligne existante dont les colonnes indiquées (index 0 = colonne A)
//         correspondent déjà à "row" ; si trouvée, la remplace ; sinon, l'ajoute.

const { getSheetsClient } = require('./lib/google');

function sheetIdPreview(id){
  if (!id) return '(vide)';
  if (id.length <= 10) return `"${id}" (${id.length} caractères)`;
  return `"${id.slice(0,6)}...${id.slice(-4)}" (${id.length} caractères)`;
}

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
      const { tab, row, matchColumns } = req.body || {};
      if (!tab || !Array.isArray(row)){
        res.status(400).json({ error: "Corps attendu : { tab: string, row: string[] }" });
        return;
      }

      if (Array.isArray(matchColumns) && matchColumns.length > 0){
        const existing = await sheets.spreadsheets.values.get({
          spreadsheetId: sheetId,
          range: `${tab}!A:Z`
        });
        const values = existing.data.values || [];
        let matchIndex = -1; // index dans "values" (0 = en-tête)
        for (let i = 1; i < values.length; i++){
          const r = values[i];
          const isMatch = matchColumns.every(ci => String(r[ci] || '') === String(row[ci] || ''));
          if (isMatch){ matchIndex = i; break; }
        }
        if (matchIndex >= 0){
          const sheetRowNumber = matchIndex + 1; // values[i] correspond à la ligne (i+1) de la feuille
          await sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: `${tab}!A${sheetRowNumber}:Z${sheetRowNumber}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [row] }
          });
          res.status(200).json({ ok: true, updated: true });
          return;
        }
      }

      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: `${tab}!A:Z`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [row] }
      });
      res.status(200).json({ ok: true, appended: true });
      return;
    }

    res.status(405).json({ error: 'Méthode non supportée.' });
  }catch(e){
    res.status(500).json({ error: 'Erreur Google Sheets : ' + e.message + ' — SHEET_ID utilisé : ' + sheetIdPreview(sheetId) });
  }
};
    
