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

// Offline werken en installeren als app
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}
