// Bandeau "ciel du jour" : la course du soleil entre Fajr et Isha, les 5 prières,
// le moment présent et la prochaine prière. La teinte de l'en-tête suit l'heure.

import { getData } from './storage.js';
import { dateKey } from './util.js';
import { prayerTimes, PRAYERS, PRAYER_NAMES } from './prayers.js';
import { dayPrayers, toHHMM } from './planning-model.js';

const W = 340, H = 56, HORIZON = 40, PEAK = 30;

export function renderSky(header) {
  const p = getData().planning;
  const key = dateKey();
  const pr = dayPrayers(p, key);
  const sun = prayerTimes(new Date(), p.place);
  const now = new Date();
  const t = now.getHours() * 60 + now.getMinutes();

  const from = pr.fajr - 30, to = pr.isha + 30;
  const x = m => ((Math.min(Math.max(m, from), to) - from) / (to - from)) * W;
  // hauteur du soleil : arc au-dessus de l'horizon le jour, léger creux la nuit
  const y = m => {
    if (m >= sun.sunrise && m <= sun.maghrib) {
      return HORIZON - PEAK * Math.sin(Math.PI * (m - sun.sunrise) / (sun.maghrib - sun.sunrise));
    }
    const d = m < sun.sunrise ? (sun.sunrise - m) / (sun.sunrise - from) : (m - sun.maghrib) / (to - sun.maghrib);
    return HORIZON + 8 * Math.sin(Math.PI / 2 * Math.min(1, d));
  };

  let path = '';
  for (let m = from; m <= to; m += 5) path += `${path ? 'L' : 'M'}${x(m).toFixed(1)},${y(m).toFixed(1)}`;

  const next = PRAYERS.find(n => pr[n] > t);
  const phase = t < pr.fajr || t > pr.isha + 30 ? 'night'
    : t < sun.sunrise + 40 ? 'dawn'
    : t < sun.maghrib - 50 ? 'day'
    : 'dusk';
  header.dataset.phase = phase;

  const until = next ? pr[next] - t : null;
  const inTxt = until === null ? '' : until < 60 ? `dans ${until} min` : `dans ${Math.floor(until / 60)} h ${String(until % 60).padStart(2, '0')}`;

  header.querySelector('.sky').innerHTML = `
    <svg viewBox="0 -4 ${W} ${H}" aria-hidden="true">
      <line class="sky-horizon" x1="0" x2="${W}" y1="${HORIZON}" y2="${HORIZON}"/>
      <path class="sky-path" d="${path}"/>
      <clipPath id="sky-clip"><rect x="-10" y="-10" width="${x(t) + 10}" height="${H + 20}"/></clipPath>
      <path class="sky-past" d="${path}" clip-path="url(#sky-clip)"/>
      ${PRAYERS.map(n => `<circle class="sky-tick ${pr[n] <= t ? 'past' : ''}" cx="${x(pr[n])}" cy="${y(pr[n])}" r="2.6"/>`).join('')}
      <circle class="sky-now ${phase}" cx="${x(t)}" cy="${y(t)}" r="5.5"/>
    </svg>
    <p class="sky-next">${next
      ? `<b>${PRAYER_NAMES[next]}</b> à ${toHHMM(pr[next])}, ${inTxt}`
      : `Coucher prévu à ${p.bedtime}, <b>Fajr</b> demain`}</p>`;
}
