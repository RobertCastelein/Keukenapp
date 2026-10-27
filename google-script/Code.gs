// Koppeling tussen de keukenapp en je Google-account: agenda's en recepten.
// Plak dit in een project op script.google.com en publiceer het als web-app
// (Uitvoeren als: ik, Toegang: iedereen). Zie README.md voor de stappen.

// Welke agenda's de app laat zien (namen zoals in Google Agenda).
const AGENDAS = ['Thuis', 'Robert Castelein', 'Verjaardagen'];
const AANTAL_DAGEN = 14;

// Hier worden de recepten bewaard, in je eigen Google Drive.
const RECEPTEN_BESTAND = 'keukenapp-recepten.json';

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.actie === 'recepten') return json({ recepten: leesRecepten() });
    if (p.actie === 'recept-toevoegen') return json({ recept: voegReceptToe(p.url) });
    if (p.actie === 'recept-verwijderen') return json({ recepten: verwijderRecept(p.id) });
    return json(agenda());
  } catch (fout) {
    return json({ fout: fout.message });
  }
}

// Recepttekst die iemand zelf heeft geplakt (voor sites die het ophalen blokkeren).
function doPost(e) {
  try {
    const p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (p.actie === 'recept-tekst') {
      const tekst = String(p.tekst || '').slice(0, 50000);
      if (!tekst.trim()) throw new Error('Er is geen tekst geplakt');
      const titel = String(p.titel || '').trim() ||
        tekst.split('\n').map((r) => r.trim()).find(Boolean).slice(0, 80);
      const bron = /^https?:\/\//.test(p.bron || '') ? p.bron : '';
      return json({ recept: bewaarNieuwRecept(receptUitTekst(tekst, { bron, titel, afbeelding: '' })) });
    }
    if (p.actie === 'recept-bijwerken') return json({ recept: werkReceptBij(p.id, p) });
    throw new Error('Onbekende actie');
  } catch (fout) {
    return json({ fout: fout.message });
  }
}

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- Agenda ----------

function agenda() {
  const van = new Date();
  van.setHours(0, 0, 0, 0);
  const tot = new Date(van.getTime() + AANTAL_DAGEN * 24 * 60 * 60 * 1000);

  const afspraken = [];
  const nietGevonden = [];
  for (const naam of AGENDAS) {
    const agenda = CalendarApp.getCalendarsByName(naam)[0];
    if (!agenda) { nietGevonden.push(naam); continue; }
    for (const e of agenda.getEvents(van, tot)) {
      afspraken.push({
        titel: e.getTitle(),
        start: e.getStartTime().toISOString(),
        eind: e.getEndTime().toISOString(),
        heleDag: e.isAllDayEvent(),
        plek: e.getLocation(),
        agenda: naam,
      });
    }
  }
  if (nietGevonden.length === AGENDAS.length) {
    throw new Error('Agenda "' + nietGevonden.join('", "') + '" niet gevonden');
  }
  return { afspraken };
}

// ---------- Recepten: opslag ----------

function receptenBestand() {
  const gevonden = DriveApp.getFilesByName(RECEPTEN_BESTAND);
  if (gevonden.hasNext()) return gevonden.next();
  return DriveApp.createFile(RECEPTEN_BESTAND, '[]', 'application/json');
}

function leesRecepten() {
  return JSON.parse(receptenBestand().getBlob().getDataAsString() || '[]');
}

function bewaarRecepten(recepten) {
  receptenBestand().setContent(JSON.stringify(recepten));
}

function voegReceptToe(url) {
  if (!url || !/^https?:\/\//.test(url)) throw new Error('Dit is geen geldige link');
  return bewaarNieuwRecept(haalReceptOp(url));
}

function bewaarNieuwRecept(recept) {
  recept.id = Utilities.getUuid();
  recept.toegevoegd = new Date().toISOString();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const recepten = leesRecepten();
    recepten.unshift(recept);
    bewaarRecepten(recepten);
  } finally {
    lock.releaseLock();
  }
  return recept;
}

// Favoriet en labels van een recept aanpassen.
function werkReceptBij(id, wijziging) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const recepten = leesRecepten();
    const recept = recepten.find((r) => r.id === id);
    if (!recept) throw new Error('Recept niet gevonden');
    if (typeof wijziging.favoriet === 'boolean') recept.favoriet = wijziging.favoriet;
    if (Array.isArray(wijziging.labels)) {
      recept.labels = wijziging.labels.map(String).filter(Boolean).slice(0, 20);
    }
    bewaarRecepten(recepten);
    return recept;
  } finally {
    lock.releaseLock();
  }
}

function verwijderRecept(id) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const recepten = leesRecepten().filter((r) => r.id !== id);
    bewaarRecepten(recepten);
    return recepten;
  } finally {
    lock.releaseLock();
  }
}

// ---------- Recepten: ophalen en uitlezen ----------

function haalReceptOp(url) {
  const instagramCode = instagramPostCode(url);
  if (instagramCode) {
    const html = haalPagina('https://www.instagram.com/p/' + instagramCode + '/embed/captioned/');
    try {
      return receptUitInstagram(html, url);
    } catch (e) {
      // Tweede poging: de beschrijving van de gewone post-pagina ("... op datum: "bijschrift"")
      const pagina = haalPagina('https://www.instagram.com/p/' + instagramCode + '/');
      const beschrijving = metaTag(pagina, 'og:description').replace(/^[\s\S]*?:\s*"/, '').replace(/"\s*$/, '');
      if (!beschrijving) throw e;
      return receptUitTekst(beschrijving, {
        bron: url,
        titel: (beschrijving.split('\n')[0] || 'Recept van Instagram').slice(0, 80),
        afbeelding: metaTag(pagina, 'og:image'),
      });
    }
  }
  return receptUitPagina(haalPagina(url), url);
}

function haalPagina(url) {
  const antwoord = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
      'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
    },
  });
  if (antwoord.getResponseCode() >= 400) {
    throw new Error('De pagina kon niet worden geopend (code ' + antwoord.getResponseCode() + ')');
  }
  return antwoord.getContentText();
}

function instagramPostCode(url) {
  const m = url.match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

// Receptsites zetten het recept meestal als "schema.org Recipe" in de pagina.
function receptUitPagina(html, url) {
  const blokken = html.match(/<script[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const blok of blokken) {
    let data;
    try {
      data = JSON.parse(blok.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '').trim());
    } catch (e) {
      continue;
    }
    const r = zoekRecept(data);
    if (r) {
      return {
        bron: url,
        titel: schoon(r.name) || metaTag(html, 'og:title') || 'Recept',
        afbeelding: afbeeldingUit(r.image) || metaTag(html, 'og:image'),
        personen: schoon(Array.isArray(r.recipeYield) ? r.recipeYield[0] : r.recipeYield),
        tijd: leesbareTijd(r.totalTime || r.cookTime),
        ingredienten: (r.recipeIngredient || []).map(schoon).filter(Boolean),
        stappen: stappenUit(r.recipeInstructions),
      };
    }
  }
  // Geen receptgegevens: dan de beschrijving van de pagina als tekst bewaren.
  return receptUitTekst(metaTag(html, 'og:description') || metaTag(html, 'description') || '', {
    bron: url,
    titel: metaTag(html, 'og:title') || titelTag(html) || 'Recept',
    afbeelding: metaTag(html, 'og:image'),
  });
}

function receptUitInstagram(html, url) {
  const m = html.match(/<div class="Caption"[^>]*>([\s\S]*?)<div class="CaptionComments"/i);
  let tekst = m ? m[1] : '';
  tekst = tekst
    .replace(/<a class="CaptionUsername"[\s\S]*?<\/a>/i, '')
    .replace(/<br\s*\/?>/gi, '\n');
  tekst = htmlNaarTekst(tekst);
  const afb = html.match(/<img class="EmbeddedMediaImage"[^>]*src="([^"]+)"/i);
  if (!tekst) {
    throw new Error('Instagram gaf de tekst van deze post niet vrij. Probeer het later nog eens of kies een andere link.');
  }
  const eersteRegel = tekst.split('\n').map((r) => r.trim()).find(Boolean) || 'Recept van Instagram';
  return receptUitTekst(tekst, {
    bron: url,
    titel: eersteRegel.replace(/[#@].*$/, '').trim().slice(0, 80) || 'Recept van Instagram',
    afbeelding: afb ? htmlNaarTekst(afb[1]) : '',
  });
}

// Zoekt in losse tekst (zoals een Instagram-bijschrift) naar ingrediënten en stappen.
function receptUitTekst(tekst, basis) {
  const regels = tekst.split(/\n+/).map((r) => r.trim()).filter(Boolean);
  const ingredienten = [];
  const stappen = [];
  let deel = null;
  for (const regel of regels) {
    const kaal = regel.replace(/^[^\p{L}\p{N}]+/u, '').toLowerCase();
    if (/^(ingredi[eë]nten|ingredients|wat heb je nodig|benodigdheden|nodig)\b/.test(kaal)) { deel = 'ing'; continue; }
    if (/^(bereiding(swijze)?|instructies|instructions|method|werkwijze|zo maak je het|stappen|directions)\b/.test(kaal)) { deel = 'stap'; continue; }
    if (/^(keukenspullen|bekijk ook|meer recepten|reacties|deel dit recept|bewaar recept)\b/.test(kaal)) { deel = null; continue; }
    if (/^#/.test(regel) || /^\d+[.)]?$/.test(regel)) continue;
    const zonderOpsomming = regel.replace(/^(\d+[.)]\s+|[-•*▪️✔️✅🔸🔹]+\s*)/u, '').trim();
    if (deel === 'ing') ingredienten.push(zonderOpsomming);
    else if (deel === 'stap') stappen.push(zonderOpsomming);
  }
  return Object.assign({ personen: '', tijd: '' }, basis, {
    ingredienten,
    stappen,
    tekst: ingredienten.length || stappen.length ? '' : tekst.trim(),
  });
}

function zoekRecept(data) {
  if (!data || typeof data !== 'object') return null;
  if (Array.isArray(data)) {
    for (const d of data) { const r = zoekRecept(d); if (r) return r; }
    return null;
  }
  const type = data['@type'];
  if (type === 'Recipe' || (Array.isArray(type) && type.indexOf('Recipe') !== -1)) return data;
  return zoekRecept(data['@graph']) || zoekRecept(data.mainEntity);
}

function stappenUit(instructies) {
  if (!instructies) return [];
  if (typeof instructies === 'string') {
    return htmlNaarTekst(instructies.replace(/<\/(p|li)>|<br\s*\/?>/gi, '\n')).split(/\n+/).map((s) => s.trim()).filter(Boolean);
  }
  const uit = [];
  for (const s of [].concat(instructies)) {
    if (typeof s === 'string') uit.push(schoon(s));
    else if (s && s.itemListElement) uit.push(...stappenUit(s.itemListElement));
    else if (s && (s.text || s.name)) uit.push(schoon(s.text || s.name));
  }
  return uit.filter(Boolean);
}

function afbeeldingUit(img) {
  if (!img) return '';
  if (typeof img === 'string') return img;
  if (Array.isArray(img)) return afbeeldingUit(img[0]);
  return img.url || '';
}

// "PT1H30M" -> "1 uur 30 min"
function leesbareTijd(duur) {
  const m = typeof duur === 'string' && duur.match(/^P(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m || (!m[1] && !m[2])) return '';
  return [m[1] ? m[1] + ' uur' : '', m[2] ? m[2] + ' min' : ''].filter(Boolean).join(' ');
}

function metaTag(html, naam) {
  const re = new RegExp('<meta[^>]+(?:property|name)=["\']' + naam + '["\'][^>]*>', 'i');
  const tag = html.match(re);
  const inhoud = tag && tag[0].match(/content=["']([^"']*)["']/i);
  return inhoud ? htmlNaarTekst(inhoud[1]) : '';
}

function titelTag(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? htmlNaarTekst(m[1]) : '';
}

function schoon(t) {
  return t == null ? '' : htmlNaarTekst(String(t)).replace(/\s+/g, ' ').trim();
}

function htmlNaarTekst(t) {
  return t
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

// Eenmalig uitvoeren vanuit de editor om Google om alle toestemmingen te laten vragen.
function toestemming() {
  ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  UrlFetchApp.fetch('https://www.google.com');
  receptenBestand();
  Logger.log('Alles in orde!');
}
