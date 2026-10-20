// Réglages → Synchronisation : connexion par code e-mail, état, synchro manuelle.

import { getData } from './storage.js';
import { esc } from './util.js';
import { ask } from './dialog.js';
import { configured, account, getStatus, onStatus, sendCode, verifyCode, signOut, syncNow, remoteExists, adoptRemote, pushAll } from './sync.js';

let step = { email: '', sent: false, msg: '' };

const ago = t => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'à l\'instant' : m < 60 ? `il y a ${m} min` : `il y a ${Math.round(m / 60)} h`;
};

function statusLine() {
  const s = getStatus();
  return {
    ok: `✓ Synchronisé ${s.at ? ago(s.at) : ''}`,
    syncing: 'Synchronisation…',
    offline: 'Hors ligne : les changements partiront au retour du réseau.',
    error: `Problème de synchro : ${esc(s.error)}. Nouvel essai dans 1 min.`,
    off: s.error ? esc(s.error) : 'En attente',
  }[s.state];
}

export function renderSync(el) {
  if (!configured()) { el.innerHTML = ''; return; }
  const who = account();
  el.innerHTML = `
    <h2 class="section-title">Synchronisation</h2>
    <div class="card sync-card">
      ${who ? `
        <p class="sync-who"><b>${esc(who)}</b><span class="small muted" data-sync-status>${statusLine()}</span></p>
        <p class="small muted">Tes données sont les mêmes sur tous les appareils connectés à ce compte. L'app marche aussi hors ligne.</p>
        <div class="row2"><button class="btn small" data-sync-now>Synchroniser</button><button class="btn small secondary" data-sync-out>Se déconnecter</button></div>`
      : step.sent ? `
        <p class="small muted">Code envoyé à <b>${esc(step.email)}</b>. Il arrive en moins d'une minute (regarde aussi les spams).</p>
        <form class="sync-form" data-sync-code>
          <input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="Code reçu par e-mail" aria-label="Code reçu par e-mail">
          <button class="btn" type="submit">Valider</button>
        </form>
        <button class="link small" data-sync-back>Changer d'adresse</button>`
      : `
        <p class="small muted">Retrouve tes données sur ton téléphone et ton ordinateur. Connecte-toi avec ton e-mail : tu recevras un code.</p>
        <form class="sync-form" data-sync-mail>
          <input name="email" type="email" inputmode="email" autocomplete="email" placeholder="ton@email.fr" value="${esc(step.email)}" aria-label="Adresse e-mail">
          <button class="btn" type="submit">Recevoir un code</button>
        </form>`}
      ${step.msg ? `<p class="small sync-msg">${esc(step.msg)}</p>` : ''}
    </div>`;

  const mail = el.querySelector('[data-sync-mail]');
  if (mail) mail.onsubmit = async e => {
    e.preventDefault();
    const email = mail.email.value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) { step.msg = 'Vérifie l\'adresse e-mail.'; return renderSync(el); }
    busy(mail, 'Envoi…');
    try { await sendCode(email); step = { email, sent: true, msg: '' }; }
    catch (err) { step.msg = /rate|limit/i.test(err.message) ? 'Trop de codes demandés : réessaie dans quelques minutes.' : `Envoi impossible : ${err.message}`; }
    renderSync(el);
  };
  const code = el.querySelector('[data-sync-code]');
  if (code) code.onsubmit = async e => {
    e.preventDefault();
    busy(code, 'Vérification…');
    try {
      await verifyCode(step.email, code.code.value);
      step = { email: '', sent: false, msg: '' };
      await firstLink();
    } catch (err) {
      step.msg = /expired|invalid/i.test(err.message) ? 'Code incorrect ou expiré. Réessaie ou demande un nouveau code.' : `Connexion impossible : ${err.message}`;
    }
    renderSync(el);
  };
  el.onclick = async e => {
    if (e.target.closest('[data-sync-back]')) { step = { email: step.email, sent: false, msg: '' }; return renderSync(el); }
    if (e.target.closest('[data-sync-now]')) { await syncNow(); return renderSync(el); }
    if (e.target.closest('[data-sync-out]')) {
      if (await ask({ title: 'Se déconnecter ?', text: 'Tes données restent sur cet appareil, mais ne seront plus synchronisées.', ok: 'Se déconnecter' })) { signOut(); renderSync(el); }
    }
  };
}

// Premier branchement : que faire si le compte et l'appareil ont tous les deux des données ?
async function firstLink() {
  const remote = await remoteExists();
  const d = getData();
  const localHasData = d.tasks.length || Object.keys(d.log).length || d.sessions.length || d.exams.length;
  if (!remote) return pushAll();
  if (!localHasData) return adoptRemote();
  const useAccount = await ask({
    title: 'Ton compte a déjà des données',
    text: 'Utiliser celles du compte (cet appareil sera remplacé), ou garder celles de cet appareil (le compte sera remplacé) ?',
    ok: 'Utiliser le compte', cancel: 'Garder cet appareil', dismiss: false,
  });
  return useAccount ? adoptRemote() : pushAll();
}

function busy(form, label) {
  const b = form.querySelector('button[type=submit]');
  b.classList.add('busy');
  b.textContent = label;
}

// met à jour la ligne d'état sans tout redessiner
onStatus(() => { document.querySelectorAll('[data-sync-status]').forEach(x => { x.innerHTML = statusLine(); }); });
