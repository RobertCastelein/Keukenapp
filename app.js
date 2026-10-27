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
      rij.append(wanneer, wat);
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
});

const bewaard = lees('agendaData');
if (bewaard) toonAfspraken(JSON.parse(bewaard));
laadAgenda();
setInterval(laadAgenda, 5 * 60 * 1000);

// Offline werken en installeren als app
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}
