// api/agenda.js
// Fonction serverless Vercel : lit l'agenda Google (adresse secrète iCal) et renvoie,
// pour une date donnée, la liste des événements de ce jour-là avec leurs horaires.
//
// Appel : GET /api/agenda?date=2026-09-10
// Réponse : { events: [ { title, description, start: "10h05", end: "10h30", startMinutes, endMinutes } ] }
//
// Configuration nécessaire sur Vercel (Project Settings > Environment Variables) :
//   ICS_URL = l'adresse secrète iCal de ton agenda Google
//   (Google Agenda > Paramètres > ton agenda > "Intégrer l'agenda" > "Adresse secrète au format iCal")

const ical = require('node-ical');

module.exports = async (req, res) => {
  // Autorise l'app (n'importe quelle origine) à appeler cette fonction
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate'); // petit cache pour ne pas re-télécharger l'agenda à chaque appel

  const { date } = req.query; // format attendu : YYYY-MM-DD
  const icsUrl = process.env.ICS_URL;

  if (!icsUrl) {
    res.status(500).json({ error: "La variable d'environnement ICS_URL n'est pas configurée sur Vercel." });
    return;
  }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "Paramètre 'date' manquant ou invalide (attendu: YYYY-MM-DD)." });
    return;
  }

  try {
    const data = await ical.async.fromURL(icsUrl);
    const pad = n => String(n).padStart(2, '0');
    const events = [];

    Object.values(data).forEach(item => {
      if (item.type !== 'VEVENT' || !item.start) return;

      // Gère les événements récurrents (ex. cours toutes les semaines) en plus des événements simples
      const occurrences = [];
      if (item.rrule) {
        try {
          const windowStart = new Date(date + 'T00:00:00');
          const windowEnd = new Date(date + 'T23:59:59');
          const dates = item.rrule.between(windowStart, windowEnd, true);
          dates.forEach(d => occurrences.push(d));
        } catch (e) { /* règle de récurrence non gérée, on ignore */ }
      } else {
        occurrences.push(new Date(item.start));
      }

      occurrences.forEach(startDate => {
        const startStr = startDate.toISOString().slice(0, 10);
        if (startStr !== date) return;
        const durationMs = (new Date(item.end) - new Date(item.start)) || 30 * 60 * 1000;
        const endDate = new Date(startDate.getTime() + durationMs);
        events.push({
          title: item.summary || '',
          description: item.description || '',
          start: `${startDate.getHours()}h${pad(startDate.getMinutes())}`,
          end: `${endDate.getHours()}h${pad(endDate.getMinutes())}`,
          startMinutes: startDate.getHours() * 60 + startDate.getMinutes(),
          endMinutes: endDate.getHours() * 60 + endDate.getMinutes()
        });
      });
    });

    events.sort((a, b) => a.startMinutes - b.startMinutes);
    res.status(200).json({ events });
  } catch (e) {
    res.status(500).json({ error: "Erreur de lecture de l'agenda : " + e.message });
  }
};
