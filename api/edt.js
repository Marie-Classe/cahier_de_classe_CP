// api/edt.js
// Lecture/écriture de l'emploi du temps, qui a une mise en page particulière
// (4 jours en blocs de colonnes fixes, pas une ligne par donnée) :
//   Lundi = colonnes A:D, Mardi = E:H, Jeudi = I:L, Vendredi = M:P
//   (dans chaque bloc : Heure, Matière, Modalité, Compétence/description)
//   Les données commencent à la ligne 2 (ligne 1 = titre du jour fusionné).
//
// GET  /api/edt?day=lundi
//      -> { slots: [ { heure, matiere, modalite, competence }, ... ] }
//
// POST /api/edt   body JSON: { day: "lundi", slots: [ {...}, ... ] }
//      -> réécrit entièrement le bloc de colonnes de ce jour

const { getSheetsClient } = require('./lib/google');

const TAB = 'Emploi du temps';
const DAY_START_COL = { lundi: 'A', mardi: 'E', jeudi: 'I', vendredi: 'M' };

function colOffset(letter, offset){
  return String.fromCharCode(letter.charCodeAt(0) + offset);
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
      const range = `${TAB}!${startCol}2:${endCol}300`;
      const result = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
      const rows = result.data.values || [];
      const slots = rows
        .filter(r => r[0] && /\d+h/.test(String(r[0])))
        .map(r => ({ heure: r[0] || '', matiere: r[1] || '', modalite: r[2] || '', competence: r[3] || '' }));
      res.status(200).json({ slots });
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
      const values = slots.map(s => [s.heure || '', s.matiere || '', s.modalite || '', s.competence || '']);
      // Efface d'abord tout le bloc (au cas où le nouveau nombre de créneaux serait plus
      // petit que l'ancien), puis écrit les nouvelles valeurs.
      await sheets.spreadsheets.values.clear({
        spreadsheetId: sheetId,
        range: `${TAB}!${startCol}2:${endCol}300`
      });
      if (values.length > 0){
        await sheets.spreadsheets.values.update({
          spreadsheetId: sheetId,
          range: `${TAB}!${startCol}2:${endCol}${1 + values.length}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values }
        });
      }
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Méthode non supportée.' });
  }catch(e){
    res.status(500).json({ error: "Erreur Google Sheets (EDT) : " + e.message });
  }
};
