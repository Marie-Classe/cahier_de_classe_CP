// api/edt.js
// Lecture/écriture de l'emploi du temps, qui a une mise en page particulière
// (4 jours en blocs de colonnes fixes, pas une ligne par donnée) :
//   Lundi = colonnes A:D, Mardi = E:H, Jeudi = I:L, Vendredi = M:P
//   (dans chaque bloc : Heure, Matière, Modalité, Compétence/description)
//
// Le nombre exact de lignes d'en-tête au-dessus des données peut varier selon la
// mise en forme ; on ne le suppose jamais fixe. On détecte automatiquement la
// première ligne dont la colonne "Heure" ressemble à une heure (ex. "8h30").
//
// GET  /api/edt?day=lundi
//      -> { slots: [ { heure, matiere, modalite, competence }, ... ] }
//
// POST /api/edt   body JSON: { day: "lundi", slots: [ {...}, ... ] }
//      -> réécrit entièrement le bloc de colonnes de ce jour (à partir de la même
//         ligne de départ détectée, pour ne jamais toucher aux lignes d'en-tête)

const { getSheetsClient } = require('./lib/google');

const TAB = "'Emploi du temps'"; // guillemets nécessaires : le nom contient un espace
const DAY_START_COL = { lundi: 'A', mardi: 'E', jeudi: 'I', vendredi: 'M' };
const DEFAULT_DATA_START_ROW = 3; // repli si aucune ligne d'heure n'est trouvée (feuille vide)
const HEADER_SCAN_ROWS = 20;
const MAX_ROW = 300;

function colOffset(letter, offset){
  return String.fromCharCode(letter.charCodeAt(0) + offset);
}

function looksLikeHeure(v){
  return v != null && /\d+h/.test(String(v));
}

async function findDataStartRow(sheets, sheetId, startCol, endCol){
  const range = `${TAB}!${startCol}1:${endCol}${HEADER_SCAN_ROWS}`;
  const result = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
  const rows = result.data.values || [];
  for (let i = 0; i < rows.length; i++){
    if (looksLikeHeure(rows[i][0])) return i + 1; // numéro de ligne (1-indexé)
  }
  return DEFAULT_DATA_START_ROW;
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
      const day = req.query.day;
      const startCol = DAY_START_COL[day];
      if (!startCol){ res.status(400).json({ error: "Paramètre 'day' invalide (lundi/mardi/jeudi/vendredi)." }); return; }
      const endCol = colOffset(startCol, 3);

      const dataStartRow = await findDataStartRow(sheets, sheetId, startCol, endCol);
      const range = `${TAB}!${startCol}${dataStartRow}:${endCol}${MAX_ROW}`;
      const result = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
      const rows = result.data.values || [];
      const slots = rows
        .filter(r => looksLikeHeure(r[0]))
        .map(r => ({ heure: r[0] || '', matiere: r[1] || '', modalite: r[2] || '', competence: r[3] || '' }));
      res.status(200).json({ slots, dataStartRow });
      return;
    }

    if (req.method === 'POST'){
      const { day, slots } = req.body || {};
      const startCol = DAY_START_COL[day];
      if (!startCol || !Array.isArray(slots)){
        res.status(400).json({ error: "Corps attendu : { day: 'lundi'|'mardi'|'jeudi'|'vendredi', slots: [...] }" });
        return;
      }
      const endCol = colOffset(startCol, 3);
      const dataStartRow = await findDataStartRow(sheets, sheetId, startCol, endCol);

      // Efface tout le bloc de données existant (jamais les lignes d'en-tête au-dessus)
      await sheets.spreadsheets.values.clear({
        spreadsheetId: sheetId,
        range: `${TAB}!${startCol}${dataStartRow}:${endCol}${MAX_ROW}`
      });

      const values = slots.map(s => [s.heure || '', s.matiere || '', s.modalite || '', s.competence || '']);
      if (values.length > 0){
        await sheets.spreadsheets.values.update({
          spreadsheetId: sheetId,
          range: `${TAB}!${startCol}${dataStartRow}:${endCol}${dataStartRow - 1 + values.length}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values }
        });
      }
      res.status(200).json({ ok: true, dataStartRow });
      return;
    }

    res.status(405).json({ error: 'Méthode non supportée.' });
  }catch(e){
    res.status(500).json({ error: "Erreur Google Sheets (EDT) : " + e.message });
  }
};
