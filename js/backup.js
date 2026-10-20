// Sauvegarde : export de toutes les données dans un fichier JSON, et import.

import { getData, update } from './storage.js';
import { dateKey } from './util.js';
import { ask } from './dialog.js';

const KEY = 'quotidien:data';

export async function exportData() {
  update(d => { d.settings.lastExport = dateKey(); });
  const json = JSON.stringify(getData(), null, 2);
  const name = `quotidien-sauvegarde-${dateKey()}.json`;
  const file = new File([json], name, { type: 'application/json' });

  // iPhone : menu de partage (Enregistrer dans Fichiers, AirDrop, mail…)
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Sauvegarde Quotidien' });
      return 'Sauvegarde prête.';
    } catch (e) {
      if (e.name === 'AbortError') return 'Export annulé.';
    }
  }
  // Ordinateur : téléchargement classique
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'Fichier téléchargé.';
}

// Renvoie un message d'erreur, ou null si l'import a réussi (la page se recharge).
export async function importFile(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return 'Ce fichier n\'est pas une sauvegarde Quotidien (JSON illisible).';
  }
  if (!data || typeof data !== 'object' || !('version' in data) || !Array.isArray(data.tasks) || !data.planning) {
    return 'Ce fichier n\'est pas une sauvegarde Quotidien.';
  }
  const when = data.settings?.lastExport ? ` du ${data.settings.lastExport}` : '';
  if (!await ask({ title: 'Remplacer tes données ?', text: `Toutes les données de l'app seront remplacées par la sauvegarde${when}.`, ok: 'Remplacer', danger: true })) return 'Import annulé.';
  localStorage.setItem(KEY, JSON.stringify(data));
  location.reload();
  return null;
}

export function daysSinceExport() {
  const last = getData().settings.lastExport;
  if (!last) return null;
  return Math.round((new Date(dateKey()) - new Date(last)) / 864e5);
}
