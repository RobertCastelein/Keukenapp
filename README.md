# Keukenapp

Webapp voor de keukentablet: klok, gedeelde agenda en recepten.

Online te openen via https://robertcastelein.github.io/Keukenapp/

## Koppeling met Google (agenda en recepten)

1. Maak in Google Agenda een agenda "Thuis" aan en deel hem met je partner.
2. Ga naar https://script.google.com, kies *Nieuw project* en vervang de code door de inhoud van `google-script/Code.gs`.
3. *Implementeren → Nieuwe implementatie → Web-app*, uitvoeren als *ik*, toegang *iedereen*. Geef toestemming.
4. Kopieer de web-app-link en plak die in de app bij Agenda → Instellen.

De link wordt alleen op het apparaat bewaard, niet in deze openbare projectmap.

### Script bijwerken

Vervang de code in je script door de nieuwe `google-script/Code.gs` en sla op. Kies dan *Implementeren → Implementaties beheren*, klik op het potlood, kies bij *Versie* **Nieuwe versie** en klik op *Implementeren*. De link blijft dan hetzelfde.

Welke agenda's de app toont, staat bovenaan in het script bij `AGENDAS`. Recepten worden bewaard in `keukenapp-recepten.json` in je Google Drive.

## Recepten toevoegen

Plak een link in het receptenvak, of deel een post vanuit Instagram of Chrome naar de app *Keuken* (Android).
