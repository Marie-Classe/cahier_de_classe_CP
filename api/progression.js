// api/progression.js
// Relit en direct les feuilles de progression (Oral, Lecture, Graphie, Maths, etc.)
// de "2026 2027 Ma progression -programmation CP" : titres, domaines, liens et
// SURTOUT les couleurs de fond des cellules (qui codent la modalité : Leçon, Modelage,
// Entraînement, Évaluation, Mission).
//
// GET /api/progression -> { subjects: { "Graphie": { date_cols: {...}, rows: [...] }, ... } }
//
// Résultat mis en cache 10 minutes en mémoire (une lecture complète interroge 15 feuilles,
// pas la peine de le refaire à chaque ouverture du Cahier journal).
//
// Variable d'environnement Vercel nécessaire :
//   PROGRESSION_SHEET_ID = l'ID de "2026 2027 Ma progression -programmation CP"

const { getSheetsClient } = require('./lib/google');

const SUBJECT_SHEETS = [
  "Oral", "Lecture", "Compréhension", "Graphie", "Dictée", "Rédaction",
  "Calcul mental", "Problèmes", "Maths", "EDL", "Anglais", "HGScEmcEvar",
  "Ed° musicale", "Art", "Fluence"
];

let cache = { data: null, timestamp: 0 };
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function rgbToHex(colorObj){
  if (!colorObj) return null;
  const r = Math.round((colorObj.red || 0) * 255);
  const g = Math.round((colorObj.green || 0) * 255);
  const b = Math.round((colorObj.blue || 0) * 255);
  if (r === 255 && g === 255 && b === 255) return null; // blanc = pas de couleur
  const toHex = n => n.toString(16).padStart(2, '0').toUpperCase();
  return 'FF' + toHex(r) + toHex(g) + toHex(b);
}

// Les dates Google Sheets sont un nombre de jours depuis le 30/12/1899.
function serialToDateStr(serial){
  if (typeof serial !== 'number') return null;
  const epoch = Date.UTC(1899, 11, 30);
  const d = new Date(epoch + Math.round(serial) * 86400000);
  return d.toISOString().slice(0, 10);
}

async function extractSheet(sheets, spreadsheetId, sheetName){
  const resp = await sheets.spreadsheets.get({
    spreadsheetId,
    ranges: [`'${sheetName}'`],
    fields: 'sheets.data.rowData.values(formattedValue,effectiveValue,userEnteredFormat.backgroundColor,hyperlink)'
  });
  const sheetData = resp.data.sheets && resp.data.sheets[0] && resp.data.sheets[0].data && resp.data.sheets[0].data[0];
  const rowData = (sheetData && sheetData.rowData) || [];
  if (rowData.length === 0) return null;

  // Ligne 1 = dates (à partir de la colonne C, index 2)
  const headerRow = rowData[0].values || [];
  const dateCols = {}; // index de colonne (0-based) -> "YYYY-MM-DD"
  headerRow.forEach((cell, idx) => {
    if (idx < 2) return;
    const ev = cell.effectiveValue;
    if (ev && typeof ev.numberValue === 'number'){
      const ds = serialToDateStr(ev.numberValue);
      if (ds) dateCols[idx] = ds;
    }
  });
  if (Object.keys(dateCols).length === 0) return null;
  const col3IsDate = Object.prototype.hasOwnProperty.call(dateCols, 2);

  const rows = [];
  for (let r = 1; r < rowData.length; r++){
    const rowValues = rowData[r].values;
    if (!rowValues || !rowValues[0]) continue;
    const titleCell = rowValues[0];
    const title = titleCell.formattedValue;
    if (!title) continue;
    const domain = rowValues[1] ? (rowValues[1].formattedValue || null) : null;
    const link = titleCell.hyperlink || null;
    let extra = null;
    if (!col3IsDate && rowValues[2] && rowValues[2].formattedValue){
      extra = rowValues[2].formattedValue;
    }
    const cells = {};
    Object.keys(dateCols).forEach(idxStr => {
      const idx = parseInt(idxStr, 10);
      const cell = rowValues[idx];
      if (!cell) return;
      const hex = rgbToHex(cell.userEnteredFormat && cell.userEnteredFormat.backgroundColor);
      const val = cell.formattedValue;
      if (hex || (val !== undefined && val !== null && val !== '')){
        cells[idx + 1] = { v: val || '', c: hex }; // clé = colonne 1-indexée, comme le reste de l'app
      }
    });
    if (Object.keys(cells).length > 0){
      rows.push({ title, domain, link, extra, cells });
    }
  }

  const date_cols = {};
  Object.entries(dateCols).forEach(([idx, ds]) => { date_cols[parseInt(idx, 10) + 1] = ds; });

  return { date_cols, rows };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const now = Date.now();
  if (cache.data && (now - cache.timestamp) < CACHE_TTL_MS){
    res.status(200).json({ subjects: cache.data, cached: true });
    return;
  }

  const spreadsheetId = process.env.PROGRESSION_SHEET_ID;
  if (!spreadsheetId){
    res.status(500).json({ error: "PROGRESSION_SHEET_ID n'est pas configuré sur Vercel." });
    return;
  }

  try{
    const sheets = getSheetsClient();
    const results = await Promise.allSettled(
      SUBJECT_SHEETS.map(name => extractSheet(sheets, spreadsheetId, name).then(data => [name, data]))
    );
    const subjects = {};
    results.forEach(r => {
      if (r.status === 'fulfilled' && r.value[1]){
        subjects[r.value[0]] = r.value[1];
      }
    });
    cache = { data: subjects, timestamp: now };
    res.status(200).json({ subjects, cached: false });
  }catch(e){
    res.status(500).json({ error: "Erreur de lecture de la progression : " + e.message });
  }
};
