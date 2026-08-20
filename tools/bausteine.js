#!/usr/bin/env node
/* =====================================================================
   Bausteine abgleichen — Kopfzeile, Sonderwünsche-Sektion und Fußzeile
   =====================================================================

   Warum es das gibt
   -----------------
   Die Seite kommt bewusst ohne Framework und ohne Build-Schritt aus:
   ausgeliefert wird genau das HTML, das hier im Ordner liegt. Der Preis
   dafür ist, dass drei Blöcke in ALLEN acht Seiten stehen — Kopfzeile
   (Navigation + Mobilmenü), die Sonderwünsche-Sektion und die Fußzeile,
   zusammen rund 1.400 Zeilen. Wer die Navigation ändert, muss das sonst
   achtmal richtig machen. Genau daran ist es schon einmal gescheitert:
   der „Jetzt anfragen"-Button zeigte auf vier Seiten auf einen Anker,
   den es dort gar nicht gibt, und tat deshalb nichts.

   Dieses Skript nimmt index.html als maßgebliche Fassung und trägt die
   drei Blöcke in die anderen Seiten ein. Es ist AUSDRÜCKLICH KEIN
   Build-Schritt, den man vor dem Hochladen ausführen muss:

     · Die HTML-Dateien bleiben jederzeit vollständig und fertig
       ausgeliefert. Läuft das Skript nie wieder, funktioniert die Seite
       genau wie heute.
     · Ohne Argument prüft es nur und ändert nichts.
     · Erst `--write` schreibt.

   Benutzung
   ---------
     node tools/bausteine.js            → prüft, meldet Abweichungen
     node tools/bausteine.js --write    → gleicht die Seiten an index.html an

   Wie die Blöcke gefunden werden
   ------------------------------
   Über HTML-Kommentare `<!-- baustein:kopf -->` … `<!-- /baustein:kopf -->`
   (ebenso `sonderwuensche` und `footer`). Alles außerhalb dieser Marken
   rührt das Skript nicht an — der eigentliche Seiteninhalt ist also nie
   in Gefahr.

   Was pro Seite verschieden bleibt
   --------------------------------
   Die Blöcke sind nicht überall wortgleich, und das ist Absicht. Die
   Unterschiede sind aber mechanisch und stehen unten in `anpassen()`:

     · Sprungmarken: auf der Startseite `#spezialitaeten`, auf allen
       Unterseiten `index.html#spezialitaeten` (der Abschnitt liegt dort
       ja nicht). Der Klick-Handler in main.js fängt nur Links ab, die
       mit „#" BEGINNEN — „index.html#…" lässt er in Ruhe, der Browser
       navigiert normal.
     · Farbschema der Leiste: über dem Hero-Foto hell auf dunkel
       (data-theme="dark"), auf den cremefarbenen Unterseiten umgekehrt.
     · aria-current="page" auf jedem Link, der auf die eigene Seite
       zeigt — für Screenreader die Auskunft „hier bist du gerade".
     · „Jetzt anfragen" führt zum Kontaktformular: auf kontakt.html als
       Sprungmarke, sonst als Link auf kontakt.html#kontakt-form.
   ===================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');

const WURZEL = path.join(__dirname, '..');
const MASTER = 'index.html';
const SEITEN = ['anfahrt.html', 'ausbildung.html', 'historie.html', 'impressum.html',
                'kontakt.html', 'schautorten.html', 'team.html'];
const BAUSTEINE = ['kopf', 'sonderwuensche', 'footer'];

/* Ankerziele, die es nur auf der Startseite gibt. */
const NUR_START = ['spezialitaeten', 'oeffnungszeiten'];

function lies(datei) {
  return fs.readFileSync(path.join(WURZEL, datei), 'utf8');
}

/* Schneidet den Inhalt zwischen den Marken heraus (ohne die Marken selbst). */
function ausschnitt(html, name, datei) {
  const auf = html.indexOf('<!-- baustein:' + name + ' -->');
  const zu = html.indexOf('<!-- /baustein:' + name + ' -->');
  if (auf === -1 || zu === -1 || zu < auf) {
    throw new Error(datei + ': Marken für „' + name + '" fehlen oder stehen verdreht.');
  }
  return html.slice(auf + ('<!-- baustein:' + name + ' -->').length, zu);
}

/* Setzt einen neuen Inhalt zwischen die Marken, alles andere bleibt. */
function ersetzen(html, name, inhalt) {
  const start = '<!-- baustein:' + name + ' -->';
  const ende = '<!-- /baustein:' + name + ' -->';
  const auf = html.indexOf(start);
  const zu = html.indexOf(ende);
  return html.slice(0, auf + start.length) + inhalt + html.slice(zu);
}

/* Die Fassung der Startseite auf eine Unterseite umschreiben. */
function anpassen(inhalt, datei) {
  let s = inhalt;

  /* Sprungmarken, die es nur auf der Startseite gibt, dorthin umleiten. */
  NUR_START.forEach(function (anker) {
    s = s.split('href="#' + anker + '"').join('href="index.html#' + anker + '"');
  });

  /* Logo führt zurück zur Startseite statt nach ganz oben. */
  s = s.replace('<a class="nav__logo" href="#"', '<a class="nav__logo" href="index.html"');

  /* Leiste steht hier über Creme, nicht über dem Hero-Foto. */
  s = s.replace('<header class="nav" id="nav" data-theme="dark">',
                '<header class="nav" id="nav" data-theme="light">');

  /* „Jetzt anfragen" zeigt aufs Kontaktformular – auf kontakt.html
     seitenintern, sonst als Sprung auf die Kontaktseite. */
  s = s.split('class="btn btn--light" href="kontakt.html#kontakt-form"')
       .join('class="btn btn--light" href="' +
             (datei === 'kontakt.html' ? '#kontakt-form' : 'kontakt.html#kontakt-form') + '"');

  /* Jeder Link auf die eigene Seite bekommt aria-current="page". */
  s = s.split('href="' + datei + '"').join('href="' + datei + '" aria-current="page"');

  return s;
}

function erwartet(masterHtml, zielHtml, datei) {
  let neu = zielHtml;
  BAUSTEINE.forEach(function (name) {
    neu = ersetzen(neu, name, anpassen(ausschnitt(masterHtml, name, MASTER), datei));
  });
  return neu;
}

function main() {
  const schreiben = process.argv.indexOf('--write') !== -1;
  const master = lies(MASTER);
  let abweichend = 0;

  SEITEN.forEach(function (datei) {
    const ist = lies(datei);
    const soll = erwartet(master, ist, datei);
    if (ist === soll) {
      console.log('  ok       ' + datei);
      return;
    }
    abweichend++;
    if (schreiben) {
      fs.writeFileSync(path.join(WURZEL, datei), soll);
      console.log('  ANGEPASST ' + datei);
    } else {
      console.log('  ABWEICHUNG ' + datei);
    }
  });

  if (!abweichend) {
    console.log('\nAlle Bausteine stimmen mit ' + MASTER + ' überein.');
  } else if (schreiben) {
    console.log('\n' + abweichend + ' Seite(n) an ' + MASTER + ' angeglichen.');
  } else {
    console.log('\n' + abweichend + ' Seite(n) weichen ab. Angleichen mit:' +
                '\n  node tools/bausteine.js --write');
    process.exitCode = 1;
  }
}

main();
