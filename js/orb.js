// Dessin de la mascotte Orbe (SVG) — sans état, utilisable partout.

const star = (cx, cy, r) => {
  const p = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .45 : r;
    p.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  return `<polygon points="${p.join(' ')}"/>`;
};

// yeux gauche, yeux droit, bouche — d'après les émoticônes ('-') (^-^) (★‿★) ('o') (>_<) (T-T) (-_-)
const FACE = {
  neutral: ['<path d="M48 50v10"/>', '<path d="M72 50v10"/>', '<path d="M55 73h10"/>'],
  joy: ['<path d="M43 58l5-6 5 6"/>', '<path d="M67 58l5-6 5 6"/>', '<path d="M52 70q8 7 16 0"/>'],
  star: [star(48, 55, 8), star(72, 55, 8), '<path d="M51 69q9 9 18 0"/>'],
  rappel: ['<path d="M48 49v11"/>', '<path d="M72 49v11"/>', '<circle cx="60" cy="74" r="4.5"/>'],
  stress: ['<path d="M43 50l9 5-9 5"/>', '<path d="M77 50l-9 5 9 5"/>', '<path d="M53 76h14"/>'],
  sad: ['<path d="M43 51h10M48 51v9"/>', '<path d="M67 51h10M72 51v9"/>', '<path d="M54 77q6-5 12 0"/>'],
  night: ['<path d="M43 56h10"/>', '<path d="M67 56h10"/>', '<path d="M54 75h12"/>'],
};
export const FACES = Object.keys(FACE);

const FX = {
  star: '<path class="spark" d="M18 30l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/><path class="spark" style="animation-delay:.5s" d="M100 22l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/><path class="spark" style="animation-delay:1s" d="M104 84l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z"/>',
  sad: '<path class="tear" d="M46 62q-3 5 0 7q3-2 0-7z"/><path class="tear" style="animation-delay:.9s" d="M74 62q-3 5 0 7q3-2 0-7z"/>',
  stress: '<path class="sweat" d="M92 34q-5 8 0 11q5-3 0-11z"/>',
  night: '<text class="z" x="90" y="30">z</text><text class="z" x="96" y="22">z</text><text class="z" x="102" y="14">z</text>',
  rappel: '<text class="bang" x="96" y="34">!</text>',
};

export function orb(size, face = 'neutral', cls = '') {
  const f = FACE[face] ? face : 'neutral';
  const tiny = size < 34;
  return `<svg class="orb ${cls} ${tiny ? 'tiny' : ''}" data-face="${f}" width="${size}" height="${size}" viewBox="0 0 120 120" aria-hidden="true">
    ${tiny ? '' : '<ellipse class="shadow" cx="60" cy="110" rx="24" ry="4.5"/>'}
    <g class="tilt"><g class="body">
      <circle class="ball" cx="60" cy="60" r="40"/><ellipse class="shine" cx="47" cy="40" rx="20" ry="13"/>
      <g class="look"><ellipse class="blush" cx="40" cy="68" rx="6" ry="3.5"/><ellipse class="blush" cx="80" cy="68" rx="6" ry="3.5"/>
        <g class="eye">${FACE[f][0]}</g><g class="eye">${FACE[f][1]}</g><g class="mouth">${FACE[f][2]}</g></g>
    </g></g>
    ${tiny ? '' : `<g class="fx">${FX[f] || ''}</g>`}</svg>`;
}

// Réaction ponctuelle (rebond, tour sur soi, sursaut, tremblement).
export function react(svg, face) {
  const cls = { joy: 'r-joy', star: 'r-star', rappel: 'r-rappel', stress: 'r-stress' }[face];
  if (!svg || !cls) return;
  svg.classList.remove(cls);
  void svg.getBoundingClientRect();
  svg.classList.add(cls);
  setTimeout(() => svg.classList.remove(cls), 1100);
}

// Vie : clignements et regards à intervalles irréguliers, pour toutes les orbes affichées.
let living = false;
export function startLife() {
  if (living) return;
  living = true;
  const loop = () => {
    if (!document.hidden) {
      document.querySelectorAll('.orb').forEach(o => {
        const f = o.dataset.face;
        if (f !== 'night' && f !== 'star' && Math.random() < .55) {
          o.querySelectorAll('.eye').forEach(e => { e.classList.remove('blink'); void e.getBoundingClientRect(); e.classList.add('blink'); });
        }
        if (!o.classList.contains('tiny') && f !== 'night' && Math.random() < .5) {
          o.querySelector('.look').style.transform = Math.random() < .35 ? ''
            : `translate(${(Math.random() * 10 - 5).toFixed(1)}px, ${(Math.random() * 6 - 3).toFixed(1)}px)`;
        }
      });
    }
    setTimeout(loop, 1500 + Math.random() * 2500);
  };
  setTimeout(loop, 1200);
}
