// Calcul local des horaires de prière (aucune connexion nécessaire).
// Algorithme astronomique classique (cf. praytimes.org).
// Méthode UOIF : Fajr et Isha à 12° sous l'horizon, Asr standard (ombre = 1).

const rad = d => (d * Math.PI) / 180;
const deg = r => (r * 180) / Math.PI;
const fix = (a, b) => { a = a - b * Math.floor(a / b); return a < 0 ? a + b : a; };

export const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
export const PRAYER_NAMES = { fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };

export const METHODS = {
  UOIF: { fajr: 12, isha: 12 },
  MWL: { fajr: 18, isha: 17 }, // Ligue islamique mondiale
  ISNA: { fajr: 15, isha: 15 }, // Amérique du Nord
  Egypte: { fajr: 19.5, isha: 17.5 },
};

function sunPosition(jd) {
  const D = jd - 2451545.0;
  const g = fix(357.529 + 0.98560028 * D, 360);
  const q = fix(280.459 + 0.98564736 * D, 360);
  const L = fix(q + 1.915 * Math.sin(rad(g)) + 0.02 * Math.sin(rad(2 * g)), 360);
  const e = 23.439 - 0.00000036 * D;
  const RA = deg(Math.atan2(Math.cos(rad(e)) * Math.sin(rad(L)), Math.cos(rad(L)))) / 15;
  return {
    decl: deg(Math.asin(Math.sin(rad(e)) * Math.sin(rad(L)))),
    eqt: q / 15 - fix(RA, 24),
  };
}

function julian(y, m, d) {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}

// Durée (en heures) entre midi solaire et le moment où le soleil est à `alt` degrés.
function hourAngle(alt, lat, decl) {
  const c = (Math.sin(rad(alt)) - Math.sin(rad(lat)) * Math.sin(rad(decl))) /
    (Math.cos(rad(lat)) * Math.cos(rad(decl)));
  return c < -1 || c > 1 ? NaN : deg(Math.acos(c)) / 15;
}

// Renvoie les horaires en minutes depuis minuit (heure locale du téléphone), avant décalages.
export function prayerTimes(date, { lat, lng, method = 'UOIF' }) {
  const m = METHODS[method] || METHODS.UOIF;
  const y = date.getFullYear(), mo = date.getMonth() + 1, d = date.getDate();
  const tz = -new Date(y, mo - 1, d, 12).getTimezoneOffset() / 60; // gère l'heure d'été
  const { decl, eqt } = sunPosition(julian(y, mo, d) - lng / 360 + 0.5);
  const noon = 12 + tz - lng / 15 - eqt;

  const sun = hourAngle(-0.833, lat, decl);
  const night = 24 - 2 * sun;
  // En été, si le soleil ne descend pas assez bas, on prend une fraction de la nuit.
  const twilight = angle => {
    const t = hourAngle(-angle, lat, decl);
    return isNaN(t) ? sun + (angle / 60) * night : Math.min(t, sun + (angle / 60) * night);
  };
  const asrAlt = deg(Math.atan(1 / (1 + Math.tan(rad(Math.abs(lat - decl))))));

  const h = {
    fajr: noon - twilight(m.fajr),
    sunrise: noon - sun,
    dhuhr: noon + 2 / 60, // marge de 2 min après le zénith
    asr: noon + hourAngle(asrAlt, lat, decl),
    maghrib: noon + sun,
    isha: noon + twilight(m.isha),
  };
  const out = {};
  for (const k in h) out[k] = Math.round(h[k] * 60);
  return out;
}
