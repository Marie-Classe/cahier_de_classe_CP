// api/rdv-synthese.js
// Transforme la transcription brute d'un rendez-vous parents en :
//   - un compte rendu organisé et précis
//   - une liste d'actions à mettre en œuvre
// en appelant l'API Claude (Anthropic).
//
// Variables d'environnement Vercel :
//   ANTHROPIC_API_KEY  (obligatoire) : clé API créée sur console.anthropic.com
//   ANTHROPIC_MODEL    (optionnelle) : modèle à utiliser (par défaut claude-sonnet-5-5)
//
// POST /api/rdv-synthese
//   body JSON : { eleve, date, personnes, motif, transcription }
//   -> { compteRendu: "...", actions: "..." }

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const MAX_TRANSCRIPTION_CHARS = 60000;

const SYSTEM_PROMPT = `Tu aides une enseignante de CP (école primaire française) à rédiger la synthèse d'un rendez-vous avec les parents d'un élève.
Tu reçois la transcription brute, issue d'une dictée vocale : elle peut contenir des erreurs de reconnaissance, des répétitions, des hésitations et n'a pas de ponctuation fiable. Corrige-les avec discernement quand le sens est évident.

Règles impératives :
- Reste strictement fidèle à ce qui a été dit. N'invente aucun fait, aucune décision, aucune date, aucun nom. Si un point est incertain ou inaudible, écris-le explicitement plutôt que de deviner.
- Le compte rendu est organisé et précis, en français, sans formules creuses. Utilise des rubriques courtes séparées par une ligne vide, en n'écrivant que celles qui ont un contenu : « Contexte », « Points abordés par l'enseignante », « Points abordés par la famille », « Décisions prises ». Sous chaque rubrique, des phrases courtes ou des tirets « - ».
- Les actions sont une liste de tirets « - ». Pour chaque action, précise qui fait quoi et, si cela a été dit, l'échéance. N'ajoute que des actions réellement évoquées ou décidées pendant le rendez-vous ; si aucune n'a été décidée, réponds exactement « Aucune action décidée pendant le rendez-vous. »
- N'utilise pas de mise en forme Markdown (ni #, ni **, ni tableaux) : du texte simple.

Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, de la forme :
{"compteRendu": "...", "actions": "..."}`;

function extractJson(text){
  const cleaned = String(text).replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('réponse sans JSON');
  return JSON.parse(cleaned.slice(start, end + 1));
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS'){ res.status(200).end(); return; }
  if (req.method !== 'POST'){ res.status(405).json({ error: 'Méthode non supportée.' }); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey){
    res.status(500).json({ error: "ANTHROPIC_API_KEY n'est pas configurée sur Vercel (voir api/rdv-synthese.js)." });
    return;
  }

  const { eleve, date, personnes, motif, transcription } = req.body || {};
  const text = String(transcription || '').trim();
  if (!text){ res.status(400).json({ error: 'Transcription vide.' }); return; }
  if (text.length > MAX_TRANSCRIPTION_CHARS){
    res.status(413).json({ error: `Transcription trop longue (${text.length} caractères, maximum ${MAX_TRANSCRIPTION_CHARS}).` });
    return;
  }

  const userMessage =
    `Élève : ${eleve || '(non précisé)'}\n` +
    `Date du rendez-vous : ${date || '(non précisée)'}\n` +
    `Personnes présentes : ${personnes || '(non précisées)'}\n` +
    `Motif : ${motif || '(non précisé)'}\n\n` +
    `Transcription :\n${text}`;

  try{
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }]
      })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok){
      const detail = (data && data.error && data.error.message) ? data.error.message : resp.status;
      res.status(502).json({ error: 'Erreur API Claude : ' + detail });
      return;
    }
    const out = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    let parsed;
    try{ parsed = extractJson(out); }
    catch(e){ res.status(502).json({ error: "La réponse de l'IA n'a pas pu être lue (format inattendu). Réessaie." }); return; }
    res.status(200).json({
      compteRendu: String(parsed.compteRendu || '').trim(),
      actions: String(parsed.actions || '').trim()
    });
  }catch(e){
    res.status(500).json({ error: 'Erreur : ' + e.message });
  }
};
