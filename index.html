// api/listes.js
// Lecture/écriture des listes personnalisées dans l'onglet "Listes grille", présentées
// en colonnes, côte à côte :
//
//        A        B (Liste 1)    C (Liste 1)    D (Liste 2)
//   1  [vide]     Autorisation   Autorisation   Matériel
//   2  Élève      Papier rendu   Photo          Trousse
//   3  Arielle    ✓              ✓ vu le 12/10  
//   4  Augustin   
//
// Ligne 1 = nom de la liste, ligne 2 = critère, colonne A = élèves.
// Une case cochée contient "✓", éventuellement suivi d'une note ("✓ vu le 12/10").
// Une case non cochée est vide, ou contient une simple note sans ✓.
// Les colonnes d'une même liste restent côte à côte : un nouveau critère est inséré
// juste après la dernière colonne de sa liste ; une nouvelle liste est ajoutée à droite.
//
// GET  /api/listes
//      -> { listes: { "Nom": ["critère 1", ...] }, values: [ {liste, eleve, critere, coche, note} ] }
//
// POST /api/listes  body JSON :
//      { liste, critere, students?: [...], eleve?, coche?, note? }
//      -> crée la colonne si besoin (en-têtes + noms des élèves) et, si "eleve" est donné,
//         écrit la case correspondante.
// POST /api/listes  body JSON : { action: "removeCriterion", liste, critere }
//      -> supprime la colonne de ce critère.

const { getSheetsClient } = require('./lib/google');

const TAB_TITLE = 'Listes grille';
const TAB = `'${TAB_TITLE}'`;
const MAX_COL = 'ZZ';
const MAX_ROW = 100;
const HEADER_ROWS = 2;

let cachedSheetId = null;

function colLetter(n){ // n = numéro de colonne à partir de 1
  let s = '';
  while (n > 0){
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function parseCell(raw){
  const v = (raw == null ? '' : String(raw)).trim();
  if (!v) return { coche: false, note: '' };
  if (v.startsWith('✓')) return { coche: true, note: v.slice(1).trim() };
  if (/^(x|oui|ok|1)$/i.test(v)) return { coche: true, note: '' };
  return { coche: false, note: v };
}
function formatCell(coche, note){
  const n = (note || '').trim();
  if (coche) return n ? `✓ ${n}` : '✓';
  return n;
}

async function ensureTab(sheets, spreadsheetId){
  if (cachedSheetId != null) return cachedSheetId;
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
  const found = (meta.data.sheets || []).find(s => s.properties.title === TAB_TITLE);
  if (found){ cachedSheetId = found.properties.sheetId; return cachedSheetId; }
  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: TAB_TITLE } } }] }
  });
  cachedSheetId = res.data.replies[0].addSheet.properties.sheetId;
  return cachedSheetId;
}

async function loadGrid(sheets, spreadsheetId){
  const r = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${TAB}!A1:${MAX_COL}${MAX_ROW}` });
  return r.data.values || [];
}

function usedColumnCount(grid){
  return Math.max(1, (grid[0] || []).length, (grid[1] || []).length);
}
function findColumn(grid, liste, critere){
  const r1 = grid[0] || [], r2 = grid[1] || [];
  const n = usedColumnCount(grid);
  for (let c = 1; c < n; c++){
    if ((r1[c] || '') === liste && (r2[c] || '') === critere) return c;
  }
  return -1;
}
function lastColumnOfList(grid, liste){
  const r1 = grid[0] || [];
  let last = -1;
  for (let c = 1; c < usedColumnCount(grid); c++){
    if ((r1[c] || '') === liste) last = c;
  }
  return last;
}
function studentRows(grid){
  const map = {};
  for (let i = HEADER_ROWS; i < grid.length; i++){
    const name = ((grid[i] || [])[0] || '').trim();
    if (name) map[name] = i; // index de ligne à partir de 0
  }
  return map;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS'){ res.status(200).end(); return; }

  const spreadsheetId = process.env.SHEET_ID;
  if (!spreadsheetId){ res.status(500).json({ error: "SHEET_ID n'est pas configuré sur Vercel." }); return; }

  try{
    const sheets = getSheetsClient();

    // ---------- Lecture ----------
    if (req.method === 'GET'){
      let grid;
      try{ grid = await loadGrid(sheets, spreadsheetId); }
      catch(e){
        // onglet pas encore créé : rien à lire
        res.status(200).json({ listes: {}, values: [] });
        return;
      }
      const r1 = grid[0] || [], r2 = grid[1] || [];
      const listes = {};
      const cols = [];
      for (let c = 1; c < usedColumnCount(grid); c++){
        const liste = (r1[c] || '').trim(), critere = (r2[c] || '').trim();
        if (!liste || !critere) continue;
        listes[liste] = listes[liste] || [];
        if (!listes[liste].includes(critere)) listes[liste].push(critere);
        cols.push({ c, liste, critere });
      }
      const values = [];
      for (let i = HEADER_ROWS; i < grid.length; i++){
        const eleve = ((grid[i] || [])[0] || '').trim();
        if (!eleve) continue;
        cols.forEach(({ c, liste, critere }) => {
          const { coche, note } = parseCell((grid[i] || [])[c]);
          if (coche || note) values.push({ liste, eleve, critere, coche, note });
        });
      }
      res.status(200).json({ listes, values });
      return;
    }

    if (req.method !== 'POST'){ res.status(405).json({ error: 'Méthode non supportée.' }); return; }
    const { action, liste, critere, students, eleve, coche, note } = req.body || {};
    if (!liste || !critere){ res.status(400).json({ error: 'Corps attendu : { liste, critere, ... }' }); return; }

    const sheetId = await ensureTab(sheets, spreadsheetId);
    let grid = await loadGrid(sheets, spreadsheetId);

    // ---------- Suppression d'un critère ----------
    if (action === 'removeCriterion'){
      const col = findColumn(grid, liste, critere);
      if (col >= 0){
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: { requests: [{ deleteDimension: { range: { sheetId, dimension: 'COLUMNS', startIndex: col, endIndex: col + 1 } } }] }
        });
      }
      res.status(200).json({ ok: true, removed: col >= 0 });
      return;
    }

    // ---------- Création de la colonne si besoin ----------
    let col = findColumn(grid, liste, critere);
    let created = false;
    if (col < 0){
      const last = lastColumnOfList(grid, liste);
      if (last >= 0 && last < usedColumnCount(grid) - 1){
        // la liste existe déjà au milieu du tableau : on insère juste après sa dernière colonne
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: { requests: [{ insertDimension: { range: { sheetId, dimension: 'COLUMNS', startIndex: last + 1, endIndex: last + 2 }, inheritFromBefore: false } }] }
        });
        col = last + 1;
      } else if (last >= 0){
        col = last + 1; // la liste est la dernière : on ajoute à droite
      } else {
        col = usedColumnCount(grid); // nouvelle liste : à droite de tout
      }
      created = true;
    }

    const data = [];
    const L = colLetter(col + 1);
    if (created){
      data.push({ range: `${TAB}!${L}1:${L}2`, values: [[liste], [critere]] });
    }

    // Colonne A : en-tête + noms des élèves (sans jamais écraser un nom existant)
    const rowsByName = studentRows(grid);
    if (!((grid[1] || [])[0])) data.push({ range: `${TAB}!A2`, values: [['Élève']] });
    let nextRow = Math.max(HEADER_ROWS, grid.length); // index 0-based de la prochaine ligne libre
    const ensureStudent = (name) => {
      if (rowsByName[name] == null){
        rowsByName[name] = nextRow;
        data.push({ range: `${TAB}!A${nextRow + 1}`, values: [[name]] });
        nextRow++;
      }
      return rowsByName[name];
    };
    (Array.isArray(students) ? students : []).forEach(ensureStudent);

    if (eleve){
      const r = ensureStudent(eleve);
      data.push({ range: `${TAB}!${L}${r + 1}`, values: [[formatCell(!!coche, note)]] });
    }

    if (data.length){
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: { valueInputOption: 'RAW', data }
      });
    }
    res.status(200).json({ ok: true, created });
  }catch(e){
    res.status(500).json({ error: 'Erreur Google Sheets : ' + e.message });
  }
};
