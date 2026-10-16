// Valeurs de départ du planning (toutes modifiables dans l'app).

export function planningDefaults() {
  return {
    place: { city: 'Vitry-sur-Seine', lat: 48.7875, lng: 2.3928, method: 'UOIF' },
    offsets: { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
    wakeBeforeFajr: 35, // minutes
    bedtime: '23:00',
    restPerMonth: 4, // jours de repos "autorisés" par mois (compteur)
    commute: { cours: 65 }, // minutes de trajet vers la fac
    // Durées utilisées pour construire les jours de cours (minutes)
    coursRules: { prep: 45, lunch: 45, dinner: 45, eveningWork: 120 },
    // Concentration : sessions de travail, pauses (minutes)
    focus: { session: 180, pause: 15, maxPauses: 2 },

    subjects: [
      { id: 'unix', name: 'Initiation à l\'environnement UNIX', short: 'UNIX', color: '#4a6fa5' },
      { id: 'alg', name: 'Algèbre', short: 'Algèbre', color: '#b0605a' },
      { id: 'ana', name: 'Analyse', short: 'Analyse', color: '#6a5fa8' },
      { id: 'prog', name: 'Programmation impérative', short: 'Prog. impérative', color: '#3f8a5a' },
      { id: 'preuves', name: 'Initiation aux preuves formelles', short: 'Preuves formelles', color: '#b5524f' },
      { id: 'ang', name: 'Anglais', short: 'Anglais', color: '#9a5a9a' },
    ],

    // Emplois du temps de cours. Chacun s'applique sur ses périodes, hors jours exclus.
    // day : 1 = lundi … 5 = vendredi
    courses: [{
      id: 's1',
      name: 'Semestre 1 · Maths-Info (DLA)',
      periods: [
        { start: '2026-09-07', end: '2026-10-16' }, // semaines 1 à 6 (Maths-Info)
        { start: '2026-11-02', end: '2026-12-11' }, // semaines 7 à 12
      ],
      except: ['2026-11-11'], // 11 novembre, férié
      slots: [
        { day: 1, start: '08:30', end: '10:00', subject: 'alg', kind: 'TD', room: 'F004' },
        { day: 1, start: '10:15', end: '11:45', subject: 'alg', kind: 'TD', room: 'F004' },
        { day: 1, start: '13:45', end: '15:15', subject: 'prog', kind: 'TD', room: 'F004' },
        { day: 1, start: '15:30', end: '17:00', subject: 'prog', kind: 'TP', room: 'F205' },

        { day: 2, start: '08:30', end: '10:00', subject: 'preuves', kind: 'TP', room: 'G207' },
        { day: 2, start: '10:15', end: '11:45', subject: 'preuves', kind: 'TP', room: 'G207' },
        { day: 2, start: '13:45', end: '15:15', subject: 'ang', kind: 'CM-TD', room: 'C212' },
        { day: 2, start: '15:30', end: '17:00', subject: 'ang', kind: 'CM-TD', room: 'C212' },
        { day: 2, start: '17:15', end: '18:45', subject: 'ana', kind: 'TD', room: 'C213' },

        { day: 3, start: '08:30', end: '10:00', subject: 'ana', kind: 'CM', room: 'Amphi Mirzakhani' },
        { day: 3, start: '10:15', end: '11:45', subject: 'alg', kind: 'CM', room: 'Amphi Mirzakhani' },
        { day: 3, start: '13:45', end: '15:15', subject: 'ana', kind: 'TD', room: 'C313' },
        { day: 3, start: '15:30', end: '17:00', subject: 'ana', kind: 'TD', room: 'C313' },
        { day: 3, start: '17:15', end: '18:45', subject: 'prog', kind: 'CM', room: 'Amphi Hermann' },

        { day: 4, start: '10:15', end: '11:45', subject: 'unix', kind: 'CM', room: 'Amphi Hermann' },

        { day: 5, start: '08:30', end: '10:00', subject: 'prog', kind: 'CM', room: 'Amphi Hermann' },
        { day: 5, start: '13:45', end: '15:15', subject: 'unix', kind: 'TP', room: 'F206' },
        { day: 5, start: '15:30', end: '17:00', subject: 'unix', kind: 'TP', room: 'F206' },
      ].map((s, i) => ({ id: `c${i}`, ...s })),
    }],

    // Modèles de journée (prières, réveil, rattrapage et cours sont ajoutés automatiquement).
    templates: {
      bibliotheque: [
        { label: 'Petit-déjeuner et préparation', start: '07:15', end: '08:00', kind: 'routine' },
        { label: 'Repos', start: '08:00', end: '09:20', kind: 'repos' },
        { label: 'Trajet', start: '09:20', end: '10:00', kind: 'trajet', away: true },
        { label: 'Bibliothèque', start: '10:00', end: '13:00', kind: 'travail', away: true },
        { label: 'Déjeuner', start: '13:00', end: '14:30', kind: 'repas', away: true },
        { label: 'Bibliothèque', start: '14:30', end: '20:00', kind: 'travail', away: true },
        { label: 'Trajet retour', start: '20:00', end: '20:40', kind: 'trajet', away: true },
        { label: 'Dîner', start: '21:00', end: '21:45', kind: 'repas' },
        { label: 'Repos', start: '21:45', end: '23:00', kind: 'repos' },
      ],
      repos: [
        { label: 'Petit-déjeuner', start: '08:30', end: '09:15', kind: 'repas' },
        { label: 'Déjeuner', start: '13:00', end: '13:45', kind: 'repas' },
        { label: 'Dîner', start: '20:00', end: '20:45', kind: 'repas' },
      ],
    },

    days: {}, // modifications d'un jour précis : { "2026-10-20": { type: 'repos' } }
  };
}
