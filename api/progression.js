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
  "Oral", "Lecture", "Compréhension", "Graphie", "Dictée", "Rédaction", "Français-Maths",
  "Calcul mental", "Problèmes", "Maths", "EDL", "Anglais", "HGScEmcEvar",
  "Ed° musicale", "Art", "Fluence"
];

// Onglets supplémentaires, repérés par leur nom (sans tenir compte des majuscules ni des
// accents) : "Culture chrétienne", "culture chretienne", "Culture religieuse"... sont lus
// et rangés sous la clé "Culture chrétienne" (utilisée pour "Culture relig" du Cahier journal).
const EXTRA_SHEETS = [
  { key: "Culture chrétienne", matches: title => norm(title).startsWith('culture') }
];

function norm(s){
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

let cache = { data: null, tabs: null, timestamp: 0 };
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

// Dates écrites en texte ("lun. 31 août 26", "mar. 1 sept. 26") quand la cellule n'est pas une vraie date
const FR_MONTH_PREFIX = [['janv',0],['févr',1],['fevr',1],['mars',2],['avr',3],['mai',4],['juin',5],['juil',6],['août',7],['aout',7],['sept',8],['oct',9],['nov',10],['déc',11],['dec',11]];
function parseFrenchDateLabel(label){
  if (!label) return null;
  const m = String(label).toLowerCase().match(/(\d{1,2})\s+([a-zéûèôîç]+)\.?\s+(\d{2,4})/);
  if (!m) return null;
  const mon = FR_MONTH_PREFIX.find(([pre]) => m[2].startsWith(pre));
  if (!mon) return null;
  let year = parseInt(m[3], 10); if (year < 100) year += 2000;
  const d = new Date(Date.UTC(year, mon[1], parseInt(m[1], 10)));
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

// Couleurs des modalités (pour "recaler" des teintes légèrement différentes dans Français-Maths)
const KNOWN_COLORS = ['FF4682B4', 'FFF5DEB3', 'FFBA55D3', 'FFFFA500', 'FFDC143C'];
function snapColor(hex){
  if (!hex) return hex;
  const v = h => [parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), parseInt(h.slice(6, 8), 16)];
  const a = v(hex);
  let best = null, bestD = Infinity;
  KNOWN_COLORS.forEach(k => { const b = v(k); const d = Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]); if (d < bestD){ bestD = d; best = k; } });
  return bestD <= 45 ? best : hex;
}

async function extractSheet(sheets, spreadsheetId, sheetName){
  const resp = await sheets.spreadsheets.get({
    spreadsheetId,
    ranges: [`'${sheetName}'`],
    fields: 'sheets.data.rowData.values(formattedValue,effectiveValue,userEnteredFormat.backgroundColor,effectiveFormat.backgroundColor,hyperlink)'
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
    } else {
      const ds = parseFrenchDateLabel(cell.formattedValue || (ev && ev.stringValue));
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
    let title = titleCell.formattedValue;
    // Onglet Lecture : sous la ligne 28, les sons à évaluer peuvent n'avoir leur nom qu'en colonne B
    if (!title && sheetName === 'Lecture' && (r + 1) > 28 && rowValues[1] && rowValues[1].formattedValue){
      title = rowValues[1].formattedValue;
    }
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
      let hex = rgbToHex(cell.userEnteredFormat && cell.userEnteredFormat.backgroundColor);
      if (!hex) hex = rgbToHex(cell.effectiveFormat && cell.effectiveFormat.backgroundColor); // couleurs issues d'une mise en forme conditionnelle
      if (sheetName === 'Français-Maths' || /^fran/i.test(sheetName) && /maths/i.test(sheetName)) hex = snapColor(hex);
      const val = cell.formattedValue;
      const cellLink = cell.hyperlink || null;
      if (hex || (val !== undefined && val !== null && val !== '') || cellLink){
        const entry = { v: val || '', c: hex };
        if (cellLink) entry.l = cellLink;
        cells[idx + 1] = entry; // clé = colonne 1-indexée, comme le reste de l'app
      }
    });
    // On garde aussi les lignes titrées sans case colorée (elles servent au livret de réussites)
    rows.push({ title, domain, link, extra, cells, rowNum: r + 1 });
  }

  const date_cols = {};
  Object.entries(dateCols).forEach(([idx, ds]) => { date_cols[parseInt(idx, 10) + 1] = ds; });

  return { date_cols, rows };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const now = Date.now();
  if (cache.data && (now - cache.timestamp) < CACHE_TTL_MS){
    res.status(200).json({ subjects: cache.data, tabs: cache.tabs, cached: true });
    return;
  }

  const spreadsheetId = process.env.PROGRESSION_SHEET_ID;
  if (!spreadsheetId){
    res.status(500).json({ error: "PROGRESSION_SHEET_ID n'est pas configuré sur Vercel." });
    return;
  }

  try{
    const sheets = getSheetsClient();

    // Noms réels des onglets (pour retrouver "culture chrétienne" quelle que soit son écriture)
    let titles = [];
    try{
      const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
      titles = (meta.data.sheets || []).map(s => s.properties.title);
    }catch(e){ /* on continue avec les noms habituels */ }
    const actualTitle = name => titles.find(t => norm(t) === norm(name)) || name;

    const plan = SUBJECT_SHEETS.map(name => ({ key: name, tab: actualTitle(name) }));
    const missing = [];
    EXTRA_SHEETS.forEach(extra => {
      const tab = titles.find(t => extra.matches(t) && !plan.some(p => p.tab === t));
      if (tab) plan.push({ key: extra.key, tab });
      else if (titles.length) missing.push(extra.key);
    });

    const results = await Promise.allSettled(
      plan.map(p => extractSheet(sheets, spreadsheetId, p.tab).then(data => ({ key: p.key, tab: p.tab, data })))
    );
    const subjects = {};
    const unreadable = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value.data){
        subjects[r.value.key] = r.value.data;
      } else {
        const reason = r.status === 'rejected' ? (r.reason && r.reason.message || 'erreur') : 'onglet vide, ou sans dates en ligne 1 à partir de la colonne C';
        unreadable.push({ onglet: plan[i].tab, raison: reason });
      }
    });
    const tabs = { lus: Object.keys(subjects), illisibles: unreadable, introuvables: missing };
    cache = { data: subjects, tabs, timestamp: now };
    res.status(200).json({ subjects, tabs, cached: false });
  }catch(e){
    res.status(500).json({ error: "Erreur de lecture de la progression : " + e.message });
  }
};
