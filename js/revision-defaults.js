// Valeurs de départ du mode examens (toutes modifiables dans l'app).
// Pré-réglées d'après tes réponses : cours → fiche → exos → annales, sessions de 2h30,
// révisions quotidiennes, 4 passages par chapitre.

export const EXAM_TYPES = {
  partiel: 'Partiel', cc: 'CC', ds: 'DS', tp: 'TP noté', oral: 'Oral', autre: 'Autre',
};

export const FORMATS = {
  exos: 'Exercices', qcm: 'QCM', oral: 'Oral', tp: 'TP / machine', mixte: 'Mixte',
};

export function revisionDefaults() {
  return {
    setupDone: false,
    profile: {
      startDays: { partiel: 21, cc: 7, ds: 7, tp: 5, oral: 7, autre: 7 }, // jours avant l'épreuve
      sessionMin: 150,      // durée idéale d'une session
      passes: 4,            // passages par chapitre
      share: 0.7,           // part du temps de travail réservée aux révisions
      spacing: [1, 3, 7, 14], // répétition espacée (jours)
    },
    // Méthodes = briques configurables. stage : ordre habituel (1 = en premier).
    // weight évolue avec tes retours (efficace / moyen / inutile).
    methods: [
      { id: 'cours', name: 'Lire le cours', stage: 1, minutes: 45, active: true, weight: 1, formats: [] },
      { id: 'fiche', name: 'Fiche résumé', stage: 2, minutes: 60, active: true, weight: 1, formats: [] },
      { id: 'exos', name: 'Exercices types', stage: 3, minutes: 90, active: true, weight: 1, formats: ['exos', 'mixte', 'qcm'] },
      { id: 'actif', name: 'Démonstrations de mémoire', stage: 3, minutes: 30, active: true, weight: 1, formats: ['exos', 'oral', 'mixte'] },
      { id: 'code', name: 'Code de tête', stage: 3, minutes: 30, active: true, weight: 1, formats: ['tp', 'exos', 'mixte'] },
      { id: 'annales', name: 'Annales', stage: 4, minutes: 120, active: true, weight: 1, formats: [] },
      { id: 'flash', name: 'Flashcards', stage: 3, minutes: 20, active: false, weight: 1, formats: ['qcm', 'oral'] },
    ],
  };
}
