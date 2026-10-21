// Réglages → Synchronisation : connexion par code e-mail, état, synchro manuelle.

import { getData } from './storage.js';
import { esc } from './util.js';
import { ask } from './dialog.js';
import { configured, account, getStatus, onStatus, sendCode, useCode, signOut, syncNow, adoptRemote, pushAll } from './sync.js';

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
        <div class="row2"><button class="btn small" data-sync-now>Synchroniser</button><button class="btn small secondary" data-sync-out>Se déconnecter</button></div>
        <details class="sync-fix"><summary class="small muted">Dépannage</summary>
          <p class="small muted">Si un appareil n'a pas les bonnes données : sur l'appareil qui a les bonnes, touche « Envoyer ». Puis sur l'autre, « Récupérer ».</p>
          <div class="row2"><button class="btn small secondary" data-sync-push>Envoyer cet appareil</button><button class="btn small secondary" data-sync-pull>Récupérer le compte</button></div>
        </details>`
      : step.sent ? `
        <ol class="sync-steps small">
          <li>Ouvre l'e-mail envoyé à <b>${esc(step.email)}</b> (regarde aussi les spams).</li>
          <li>Touche le lien : une page Quotidien s'ouvre et affiche ton <b>code de connexion</b>.</li>
          <li>Touche « Copier le code », reviens ici et colle-le.</li>
        </ol>
        <form class="sync-form" data-sync-code>
          <input name="code" autocomplete="one-time-code" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Code de connexion" aria-label="Code de connexion">
          <button class="btn secondary" type="button" data-sync-paste>Coller</button>
          <button class="btn" type="submit">Valider</button>
        </form>
        <button class="link small" data-sync-back>Changer d'adresse</button>`
      : `
        <p class="small muted">Retrouve tes données sur ton téléphone et ton ordinateur. Connecte-toi avec ton e-mail : tu recevras un lien de connexion.</p>
        <form class="sync-form" data-sync-mail>
          <input name="email" type="email" inputmode="email" autocomplete="email" placeholder="ton@email.fr" value="${esc(step.email)}" aria-label="Adresse e-mail">
          <button class="btn" type="submit">Recevoir le lien</button>
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
      await useCode(step.email, code.code.value);
      step = { email: '', sent: false, msg: '' };
      await syncNow();
    } catch (err) {
      step.msg = /expired|invalid|not found|refresh/i.test(err.message) ? 'Code incorrect ou déjà utilisé. Demande un nouvel e-mail.' : `Connexion impossible : ${err.message}`;
    }
    renderSync(el);
  };
  el.onclick = async e => {
    if (e.target.closest('[data-sync-paste]')) {
      try { el.querySelector('[name=code]').value = (await navigator.clipboard.readText()).trim(); } catch { el.querySelector('[name=code]').focus(); }
      return;
    }
    if (e.target.closest('[data-sync-back]')) { step = { email: step.email, sent: false, msg: '' }; return renderSync(el); }
    if (e.target.closest('[data-sync-now]')) { await syncNow(); return renderSync(el); }
    if (e.target.closest('[data-sync-push]')) {
      if (await ask({ title: 'Envoyer cet appareil ?', text: 'Les données du compte seront remplacées par celles de cet appareil.', ok: 'Envoyer', danger: true })) {
        try { await pushAll(); step.msg = '✓ Données envoyées sur le compte.'; } catch (err) { step.msg = `Envoi impossible : ${err.message}`; }
        return renderSync(el);
      }
    }
    if (e.target.closest('[data-sync-pull]')) {
      if (await ask({ title: 'Récupérer le compte ?', text: 'Les données de cet appareil seront remplacées par celles du compte.', ok: 'Récupérer', danger: true })) {
        try { step.msg = await adoptRemote() ? '✓ Données du compte récupérées.' : 'Le compte est vide.'; } catch (err) { step.msg = `Récupération impossible : ${err.message}`; }
        return renderSync(el);
      }
    }
    if (e.target.closest('[data-sync-out]')) {
      if (await ask({ title: 'Se déconnecter ?', text: 'Tes données restent sur cet appareil, mais ne seront plus synchronisées.', ok: 'Se déconnecter' })) { signOut(); renderSync(el); }
    }
  };
}

function busy(form, label) {
  const b = form.querySelector('button[type=submit]');
  b.classList.add('busy');
  b.textContent = label;
}

// met à jour la ligne d'état sans tout redessiner
onStatus(() => { document.querySelectorAll('[data-sync-status]').forEach(x => { x.innerHTML = statusLine(); }); });
