// Geeft de afspraken uit de gedeelde agenda door aan de keukenapp.
// Plak dit in een nieuw project op script.google.com en publiceer het als web-app
// (Uitvoeren als: ik, Toegang: iedereen). Zie README.md voor de stappen.

const CALENDAR_NAAM = 'Thuis';
const AANTAL_DAGEN = 14;

function doGet() {
  const agenda = CalendarApp.getCalendarsByName(CALENDAR_NAAM)[0];
  if (!agenda) {
    return json({ fout: 'Agenda "' + CALENDAR_NAAM + '" niet gevonden' });
  }

  const van = new Date();
  van.setHours(0, 0, 0, 0);
  const tot = new Date(van.getTime() + AANTAL_DAGEN * 24 * 60 * 60 * 1000);

  const afspraken = agenda.getEvents(van, tot).map((e) => ({
    titel: e.getTitle(),
    start: e.getStartTime().toISOString(),
    eind: e.getEndTime().toISOString(),
    heleDag: e.isAllDayEvent(),
    plek: e.getLocation(),
  }));

  return json({ agenda: CALENDAR_NAAM, afspraken });
}

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
