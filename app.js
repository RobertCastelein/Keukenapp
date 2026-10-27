// Klok en datum
const tijdEl = document.getElementById('tijd');
const datumEl = document.getElementById('datum');
const tijdFormaat = new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' });
const datumFormaat = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });

function toonTijd() {
  const nu = new Date();
  tijdEl.textContent = tijdFormaat.format(nu);
  datumEl.textContent = datumFormaat.format(nu);
}
toonTijd();
setInterval(toonTijd, 1000);

// Scherm aan houden (werkt in Chrome op Android zolang de app zichtbaar is)
let wakeLock = null;
const wakkerEl = document.getElementById('wakker');

async function houdSchermAan() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakkerEl.hidden = false;
    wakeLock.addEventListener('release', () => { wakkerEl.hidden = true; });
  } catch (e) {
    wakkerEl.hidden = true;
  }
}
houdSchermAan();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') houdSchermAan();
});

// Schermvullend (een browser vereist hiervoor een tik)
const volledigKnop = document.getElementById('volledig');
volledigKnop.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch (e) { /* niet ondersteund */ }
  houdSchermAan();
});
document.addEventListener('fullscreenchange', () => {
  volledigKnop.textContent = document.fullscreenElement ? 'Venster' : 'Schermvullend';
});

// Agenda: haalt de afspraken op via het Google-script (link staat alleen op dit apparaat)
const agendaLijst = document.getElementById('agendaLijst');
const agendaDialoog = document.getElementById('agendaDialoog');
const agendaUrlVeld = document.getElementById('agendaUrl');
const dagFormaat = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });

function lees(sleutel) {
  try { return localStorage.getItem(sleutel); } catch (e) { return null; }
}
function bewaar(sleutel, waarde) {
  try { localStorage.setItem(sleutel, waarde); } catch (e) { /* geen opslag */ }
}

// Dezelfde kleuren als in Google Agenda
const agendaKleuren = { 'Thuis': '#e67c73', 'Robert Castelein': '#7986cb', 'Verjaardagen': '#33b679' };

function dagSleutel(d) {
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

function dagNaam(d) {
  const vandaag = new Date();
  const morgen = new Date(vandaag.getFullYear(), vandaag.getMonth(), vandaag.getDate() + 1);
  if (dagSleutel(d) === dagSleutel(vandaag)) return 'vandaag';
  if (dagSleutel(d) === dagSleutel(morgen)) return 'morgen';
  return dagFormaat.format(d);
}

function toonAfspraken(afspraken, melding) {
  // Afspraken over meerdere dagen komen bij elke dag te staan
  const perDag = new Map();
  const vandaag = new Date();
  vandaag.setHours(0, 0, 0, 0);
  for (const a of afspraken) {
    const start = new Date(a.start);
    const eind = new Date(a.eind);
    const dag = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    do {
      if (dag >= vandaag) {
        const k = dagSleutel(dag);
        if (!perDag.has(k)) perDag.set(k, { datum: new Date(dag), items: [] });
        perDag.get(k).items.push(a);
      }
      dag.setDate(dag.getDate() + 1);
    } while (dag < eind);
  }

  agendaLijst.replaceChildren();
  if (perDag.size === 0 && !melding) {
    agendaLijst.innerHTML = '<p class="leeg">Geen afspraken de komende twee weken.</p>';
  }
  const dagen = [...perDag.values()].sort((x, y) => x.datum - y.datum);
  for (const { datum, items } of dagen) {
    const blok = document.createElement('div');
    blok.className = 'dag';
    const kop = document.createElement('h3');
    kop.textContent = dagNaam(datum);
    blok.append(kop);
    items.sort((x, y) => (y.heleDag - x.heleDag) || (new Date(x.start) - new Date(y.start)));
    for (const a of items) {
      const rij = document.createElement('div');
      rij.className = 'afspraak';
      const wanneer = document.createElement('span');
      wanneer.className = 'wanneer';
      wanneer.textContent = a.heleDag ? 'Hele dag' : tijdFormaat.format(new Date(a.start));
      const wat = document.createElement('span');
      wat.textContent = a.titel || '(geen titel)';
      if (a.plek) {
        const plek = document.createElement('span');
        plek.className = 'plek';
        plek.textContent = a.plek;
        wat.append(plek);
      }
      const stip = document.createElement('span');
      stip.className = 'stip';
      if (agendaKleuren[a.agenda]) stip.style.background = agendaKleuren[a.agenda];
      stip.title = a.agenda || '';
      rij.append(stip, wanneer, wat);
      blok.append(rij);
    }
    agendaLijst.append(blok);
  }
  if (melding) {
    const p = document.createElement('p');
    p.className = 'melding';
    p.textContent = melding;
    agendaLijst.append(p);
  }
}

async function laadAgenda() {
  const url = lees('agendaUrl');
  if (!url) return;
  try {
    const antwoord = await fetch(url);
    const data = await antwoord.json();
    if (data.fout) throw new Error(data.fout);
    bewaar('agendaData', JSON.stringify(data.afspraken));
    toonAfspraken(data.afspraken);
  } catch (e) {
    const oud = lees('agendaData');
    const melding = 'Agenda kon niet worden bijgewerkt' + (e.message ? ': ' + e.message : '') + '.';
    toonAfspraken(oud ? JSON.parse(oud) : [], melding);
  }
}

document.getElementById('agendaInstellen').addEventListener('click', () => {
  agendaUrlVeld.value = lees('agendaUrl') || '';
  agendaDialoog.showModal();
});
agendaDialoog.addEventListener('close', () => {
  if (agendaDialoog.returnValue !== 'opslaan') return;
  bewaar('agendaUrl', agendaUrlVeld.value.trim());
  laadAgenda();
  laadRecepten();
});

const bewaard = lees('agendaData');
if (bewaard) toonAfspraken(JSON.parse(bewaard));
laadAgenda();
setInterval(laadAgenda, 5 * 60 * 1000);

// Recepten: worden via het Google-script opgehaald en in je Google Drive bewaard
const receptForm = document.getElementById('receptForm');
const receptLink = document.getElementById('receptLink');
const receptMelding = document.getElementById('receptMelding');
const receptLijst = document.getElementById('receptLijst');
const receptDialoog = document.getElementById('receptDialoog');
let recepten = [];
let openRecept = null;

function scriptUrl(actie, extra) {
  const basis = lees('agendaUrl');
  if (!basis) return null;
  const u = new URL(basis);
  u.searchParams.set('actie', actie);
  for (const [k, v] of Object.entries(extra || {})) u.searchParams.set(k, v);
  return u.toString();
}

async function stuurScript(gegevens) {
  const basis = lees('agendaUrl');
  if (!basis) throw new Error('Koppel eerst je Google-script via Agenda → Instellen');
  // Geen Content-Type meegeven: dan is het een "eenvoudig" verzoek dat Google accepteert
  const data = await (await fetch(basis, { method: 'POST', body: JSON.stringify(gegevens) })).json();
  if (data.fout) throw new Error(data.fout);
  return data;
}

async function vraagScript(actie, extra) {
  const url = scriptUrl(actie, extra);
  if (!url) throw new Error('Koppel eerst je Google-script via Agenda → Instellen');
  const data = await (await fetch(url)).json();
  if (data.fout) throw new Error(data.fout);
  return data;
}

function meld(tekst) {
  receptMelding.textContent = tekst || '';
  receptMelding.hidden = !tekst;
}

function toonRecepten() {
  receptLijst.replaceChildren();
  if (recepten.length === 0) {
    receptLijst.innerHTML = '<p class="leeg">Nog geen recepten. Plak hierboven een link van Instagram of een receptsite.</p>';
    return;
  }
  for (const r of recepten) {
    const tegel = document.createElement('button');
    tegel.type = 'button';
    tegel.className = 'tegel';
    const beeld = document.createElement(r.afbeelding ? 'img' : 'div');
    beeld.className = 'beeld';
    if (r.afbeelding) {
      beeld.src = r.afbeelding;
      beeld.alt = '';
      beeld.loading = 'lazy';
      beeld.referrerPolicy = 'no-referrer';
      beeld.onerror = () => beeld.removeAttribute('src');
    }
    const naam = document.createElement('div');
    naam.className = 'naam';
    naam.textContent = r.titel;
    tegel.append(beeld, naam);
    tegel.addEventListener('click', () => toonRecept(r));
    receptLijst.append(tegel);
  }
}

function vulLijst(el, items, metVinkjes) {
  el.replaceChildren();
  for (const tekst of items) {
    const li = document.createElement('li');
    if (metVinkjes) {
      const label = document.createElement('label');
      const vink = document.createElement('input');
      vink.type = 'checkbox';
      const span = document.createElement('span');
      span.textContent = tekst;
      label.append(vink, span);
      li.append(label);
    } else {
      const span = document.createElement('span');
      span.textContent = tekst;
      li.append(span);
    }
    el.append(li);
  }
}

function toonRecept(r) {
  openRecept = r;
  const img = document.getElementById('rAfbeelding');
  img.hidden = !r.afbeelding;
  img.referrerPolicy = 'no-referrer';
  if (r.afbeelding) img.src = r.afbeelding;
  img.onerror = () => { img.hidden = true; };
  document.getElementById('rTitel').textContent = r.titel;
  document.getElementById('rInfo').textContent = [r.personen, r.tijd].filter(Boolean).join(' · ');
  vulLijst(document.getElementById('rIngredienten'), r.ingredienten || [], true);
  vulLijst(document.getElementById('rStappen'), r.stappen || [], false);
  document.getElementById('rIngredientenBlok').hidden = !(r.ingredienten || []).length;
  document.getElementById('rStappenBlok').hidden = !(r.stappen || []).length;
  const tekst = document.getElementById('rTekst');
  tekst.textContent = r.tekst || '';
  tekst.hidden = !r.tekst;
  document.getElementById('rBron').href = r.bron;
  receptDialoog.showModal();
  receptDialoog.scrollTop = 0;
}

document.getElementById('receptSluit').addEventListener('click', () => receptDialoog.close());
document.getElementById('rVerwijder').addEventListener('click', async () => {
  if (!openRecept || !confirm('"' + openRecept.titel + '" verwijderen?')) return;
  try {
    const data = await vraagScript('recept-verwijderen', { id: openRecept.id });
    recepten = data.recepten;
    bewaar('receptenData', JSON.stringify(recepten));
    toonRecepten();
    receptDialoog.close();
  } catch (e) {
    alert('Verwijderen lukte niet: ' + e.message);
  }
});

async function voegReceptToe(link) {
  const knop = receptForm.querySelector('button');
  knop.disabled = true;
  meld('Recept ophalen…');
  try {
    const data = await vraagScript('recept-toevoegen', { url: link });
    if (!data.recept) throw new Error('je Google-script is nog de oude versie');
    receptLink.value = '';
    meld('');
    nieuwRecept(data.recept);
  } catch (e) {
    meld('Dat lukte niet: ' + e.message + '. Je kunt de tekst van het recept ook zelf plakken.');
    openPlakDialoog(link);
  } finally {
    knop.disabled = false;
  }
}

function nieuwRecept(recept) {
  recepten.unshift(recept);
  bewaar('receptenData', JSON.stringify(recepten));
  toonRecepten();
  toonRecept(recept);
}

// Recepttekst zelf plakken, voor sites die het ophalen blokkeren
const plakDialoog = document.getElementById('plakDialoog');
const plakForm = document.getElementById('plakForm');

function openPlakDialoog(bron) {
  document.getElementById('plakBron').value = bron || '';
  plakDialoog.showModal();
}

document.getElementById('zelfPlakken').addEventListener('click', () => openPlakDialoog(receptLink.value.trim()));
document.getElementById('plakAnnuleer').addEventListener('click', () => plakDialoog.close());
plakForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const knop = plakForm.querySelector('button[type=submit]');
  knop.disabled = true;
  try {
    const data = await stuurScript({
      actie: 'recept-tekst',
      titel: document.getElementById('plakTitel').value.trim(),
      tekst: document.getElementById('plakTekst').value,
      bron: document.getElementById('plakBron').value,
    });
    if (!data.recept) throw new Error('je Google-script is nog de oude versie');
    plakForm.reset();
    plakDialoog.close();
    receptLink.value = '';
    meld('');
    nieuwRecept(data.recept);
  } catch (fout) {
    alert('Opslaan lukte niet: ' + fout.message);
  } finally {
    knop.disabled = false;
  }
});

receptForm.addEventListener('submit', (e) => {
  e.preventDefault();
  voegReceptToe(receptLink.value.trim());
});

async function laadRecepten() {
  if (!lees('agendaUrl')) return;
  try {
    const data = await vraagScript('recepten');
    if (!Array.isArray(data.recepten)) throw new Error('je Google-script is nog de oude versie');
    recepten = data.recepten;
    bewaar('receptenData', JSON.stringify(recepten));
    toonRecepten();
  } catch (e) {
    meld('Recepten konden niet worden bijgewerkt: ' + e.message);
  }
}

try { recepten = JSON.parse(lees('receptenData') || '[]'); } catch (e) { recepten = []; }
toonRecepten();
laadRecepten();
setInterval(laadRecepten, 15 * 60 * 1000);

// Gedeeld vanuit een andere app (bijv. Instagram → Delen → Keuken)
const gedeeld = new URLSearchParams(location.search);
const gedeeldeLink = ['link', 'tekst', 'titel']
  .map((k) => (gedeeld.get(k) || '').match(/https?:\/\/\S+/))
  .find(Boolean);
if (gedeeldeLink) {
  history.replaceState(null, '', location.pathname);
  receptLink.value = gedeeldeLink[0];
  voegReceptToe(gedeeldeLink[0]);
}

// Offline werken en installeren als app
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}
