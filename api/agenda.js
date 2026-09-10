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

// Convertit une Date JS en heure/minute et en date (YYYY-MM-DD) exprimées dans le
// fuseau Europe/Paris, quel que soit le fuseau du serveur (Vercel tourne en UTC).
function toParisParts(date){
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(date);
  const get = t => parts.find(p => p.type === t).value;
  return {
    dateStr: `${get('year')}-${get('month')}-${get('day')}`,
    hour: parseInt(get('hour'), 10) % 24, // Intl peut renvoyer "24" pour minuit
    minute: parseInt(get('minute'), 10)
  };
}

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

      // L'heure de début/fin est TOUJOURS calculée depuis l'horaire d'origine de
      // l'événement (fiable, correctement converti en heure de Paris). Pour un
      // événement récurrent, seule la DATE de l'occurrence change, jamais l'heure —
      // ça évite un bug de décalage horaire que la librairie de récurrence peut
      // introduire sur les occurrences générées.
      const originalStart = toParisParts(new Date(item.start));
      const originalEnd = toParisParts(new Date(item.end || item.start));

      const occurrenceDates = [];
      if (item.rrule) {
        try {
          // Fenêtre volontairement large (fuseau serveur ≠ Europe/Paris) ; le filtre
          // exact sur le jour se fait ensuite via toParisParts().dateStr === date
          const windowStart = new Date(date + 'T00:00:00Z');
          windowStart.setUTCDate(windowStart.getUTCDate() - 1);
          const windowEnd = new Date(date + 'T23:59:59Z');
          windowEnd.setUTCDate(windowEnd.getUTCDate() + 1);
          item.rrule.between(windowStart, windowEnd, true).forEach(d => occurrenceDates.push(d));
        } catch (e) { /* règle de récurrence non gérée, on ignore */ }
      } else {
        occurrenceDates.push(new Date(item.start));
      }

      occurrenceDates.forEach(occDate => {
        // On ne se sert de la date d'occurrence QUE pour savoir quel jour c'est,
        // jamais pour l'heure (voir commentaire ci-dessus).
        const occDay = toParisParts(occDate).dateStr;
        if (occDay !== date) return;
        events.push({
          title: item.summary || '',
          description: item.description || '',
          start: `${originalStart.hour}h${pad(originalStart.minute)}`,
          end: `${originalEnd.hour}h${pad(originalEnd.minute)}`,
          startMinutes: originalStart.hour * 60 + originalStart.minute,
          endMinutes: originalEnd.hour * 60 + originalEnd.minute
        });
      });
    });

    events.sort((a, b) => a.startMinutes - b.startMinutes);
    res.status(200).json({ events });
  } catch (e) {
    res.status(500).json({ error: "Erreur de lecture de l'agenda : " + e.message });
  }
};
