/* =====================================================================
   Nestler Spezialitäten-Bäckerei — Interaktion
   ===================================================================== */
(function () {
  'use strict';

  // Ganz am Anfang, synchron: schaltet das CSS-Sicherheitsnetz für .reveal
  // scharf (siehe styles.css, "html.js .reveal") – die verbergende Deckkraft
  // greift nur, wenn dieses Skript tatsächlich läuft.
  document.documentElement.classList.add('js');

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function ladeansichtBeenden() {
    window.setTimeout(function () {
      document.documentElement.classList.add('is-loaded');
    }, reduceMotion ? 0 : 220);
  }
  if (document.readyState === 'complete') ladeansichtBeenden();
  else window.addEventListener('load', ladeansichtBeenden, { once: true });

  /* ── Sprache ───────────────────────────────────────────────────────────
     Dieses Skript wird unverändert von allen drei Sprachfassungen der
     Startseite eingebunden (/, /en/, /cs/) sowie von den bislang nur
     deutschen Unterseiten. Die paar Textstücke, die main.js selbst zur
     Laufzeit setzt (nicht schon fertig im HTML stehen – dort übersetzt
     jede Sprachfassung ganz normal ihr eigenes Markup), holt es sich hier
     über <html lang="…">, statt eine zweite main.js pro Sprache zu
     pflegen. Unbekannte/fehlende Sprache fällt auf Deutsch zurück. */
  var SPRACHE = (document.documentElement.lang || 'de').slice(0, 2).toLowerCase();
  var TEXTE = {
    de: { menuOeffnen: 'Menü öffnen', menuSchliessen: 'Menü schließen',
          geoeffnet: 'Geöffnet', geschlossen: 'Geschlossen',
          heuteBis: 'Heute bis {zeit} Uhr geöffnet', heuteAb: 'Öffnet heute um {zeit} Uhr', morgenAb: 'Öffnet morgen um {zeit} Uhr', naechsteOeffnung: 'Öffnet {tag} um {zeit} Uhr', heuteGeschlossen: 'Heute geschlossen',
          karussell: 'Karussell', spezialitaeten: 'Unsere Spezialitäten' },
    en: { menuOeffnen: 'Open menu', menuSchliessen: 'Close menu',
          geoeffnet: 'Open', geschlossen: 'Closed',
          heuteBis: 'Open today until {zeit}', heuteAb: 'Opens today at {zeit}', morgenAb: 'Opens tomorrow at {zeit}', naechsteOeffnung: 'Opens {tag} at {zeit}', heuteGeschlossen: 'Closed today',
          karussell: 'Carousel', spezialitaeten: 'Our specialities' },
    cs: { menuOeffnen: 'Otevřít menu', menuSchliessen: 'Zavřít menu',
          geoeffnet: 'Otevřeno', geschlossen: 'Zavřeno',
          heuteBis: 'Dnes otevřeno do {zeit}', heuteAb: 'Dnes otevírá v {zeit}', morgenAb: 'Zítra otevírá v {zeit}', naechsteOeffnung: 'Otevírá {tag} v {zeit}', heuteGeschlossen: 'Dnes zavřeno',
          karussell: 'Kolotoč', spezialitaeten: 'Naše speciality' }
  };
  var T = TEXTE[SPRACHE] || TEXTE.de;

  /* ── Kleine Helfer ────────────────────────────────────────────────────
     Drei Muster wiederholten sich vorher fast wörtlich über die ganze
     Datei verteilt: eine NodeList in ein echtes Array wandeln, einen
     Scroll-/Resize-Handler auf einen rAF-Takt drosseln, und prüfen, ob
     ein Element weit genug im Bild ist. Jeweils einmal hier, statt fünf-
     bis achtmal in den einzelnen Blöcken. Bewusst schlanke Funktionen
     ohne eigene Abstraktionsebene – sie ersetzen genau den Code, der
     vorher kopiert dastand, und nichts darüber hinaus.                  */

  /* NodeList → Array (die Seite läuft ohne Build-Schritt, daher ES5). */
  function alleEl(sel, wurzel) {
    return Array.prototype.slice.call((wurzel || document).querySelectorAll(sel));
  }

  /* Gibt eine Fassung von fn zurück, die höchstens einmal pro Bild läuft,
     egal wie oft das Ereignis feuert. */
  function gedrosselt(fn) {
    var wartet = false;
    return function () {
      if (wartet) return;
      wartet = true;
      window.requestAnimationFrame(function () { wartet = false; fn(); });
    };
  }

  /* Meldet fn (gedrosselt) für Scrollen und Größenänderung an und gibt
     eine Funktion zurück, die beides wieder abmeldet – die Blöcke, die
     nur einmal auslösen sollen, hängen sich damit selbst wieder aus. */
  function beiScrollUndResize(fn) {
    var handler = gedrosselt(fn);
    window.addEventListener('scroll', handler, { passive: true });
    window.addEventListener('resize', handler, { passive: true });
    return function () {
      window.removeEventListener('scroll', handler);
      window.removeEventListener('resize', handler);
    };
  }

  /* Ein Element gilt als "sichtbar genug", sobald sein oberer Rand die
     untere Viewport-Kante von unten erreicht (92 %) UND sein unterer Rand
     nicht schon oberhalb des Viewports liegt (Rückwärts-Scrollen vor dem
     ersten Einblenden). Bewusst keine Konstruktion, die vor dem
     tatsächlichen Erreichen schon auslöst. */
  function imBild(el) {
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var r = el.getBoundingClientRect();
    return r.top < vh * 0.92 && r.bottom > 0;
  }

  /* ── Sanftes Scrollen ────────────────────────────────────────────────
     Lenis-artiges Prinzip ohne Abhängigkeit: Das Mausrad verschiebt nur
     ein Ziel; die sichtbare Position folgt diesem Ziel zeitbasiert. Die
     exponentielle Kurve fühlt sich auf 60/120/144-Hz-Displays gleich an.
     Touch, Tastatur und Scrollbalken bleiben bewusst nativ.             */
  var smooth = reduceMotion ? null : createSmoothScroll();

  function createSmoothScroll() {
    var root = document.documentElement;
    var target = window.scrollY;
    var current = target;
    var running = false;
    var selfScroll = false;
    var last = 0;
    var lastTick = 0;
    var notfall = null;
    var SMOOTH_MS = 175;

    root.classList.add('has-smooth');

    function limit() { return Math.max(0, root.scrollHeight - window.innerHeight); }
    function clamp(v) { return Math.max(0, Math.min(limit(), v)); }

    function apply(y) {
      selfScroll = true;
      window.scrollTo(0, y);
      selfScroll = false;
    }

    function tick(now) {
      if (!last) last = now;
      var dt = Math.min(64, now - last);
      last = now;
      lastTick = now;

      var diff = target - current;
      if (Math.abs(diff) < 0.4) {
        current = target;
        apply(current);
        running = false;
        last = 0;
        return;
      }
      /* Zeitkonstante statt festem Lerp: kein anderes Gefühl bei hoher Hz. */
      current += diff * (1 - Math.exp(-dt / SMOOTH_MS));
      apply(current);
      window.requestAnimationFrame(tick);
    }

    function start() {
      if (running) return;
      running = true;
      last = 0;
      window.requestAnimationFrame(tick);
    }

    function nativUebernehmen() {
      window.clearTimeout(notfall);
      running = false;
      last = 0;
      target = current = window.scrollY;
    }

    window.addEventListener('wheel', function (e) {
      if (e.ctrlKey || e.metaKey) return;                       /* Zoomen */
      if (e.target.closest && e.target.closest('[data-scroll-native]')) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;      /* horizontale Geste */
      if (limit() <= 0) return;
      e.preventDefault();
      var d = e.deltaY;
      if (e.deltaMode === 1) d *= 16;                           /* Zeilen */
      else if (e.deltaMode === 2) d *= window.innerHeight;      /* Seiten */
      var maxSchritt = window.innerHeight * .9;
      d = Math.max(-maxSchritt, Math.min(maxSchritt, d));
      target = clamp(target + d * .92);
      start();

      /* Sicherheitsnetz: läuft die Animationsschleife nicht (Tab im
         Hintergrund, gedrosseltes rAF), Position direkt setzen –
         Scrollen darf nie blockiert sein. */
      window.clearTimeout(notfall);
      notfall = window.setTimeout(function () {
        if (performance.now() - lastTick > 250) {
          current = target;
          apply(current);
          running = false;
        }
      }, 260);
    }, { passive: false });

    /* Tastatur, Scrollbalken, Touch: Position übernehmen statt dagegenhalten */
    window.addEventListener('scroll', function () {
      if (selfScroll || running) return;
      target = current = window.scrollY;
    }, { passive: true });

    /* Direkte Eingaben sollen niemals gegen eine noch auslaufende
       Mausradbewegung kämpfen. */
    window.addEventListener('pointerdown', nativUebernehmen, { passive: true });
    window.addEventListener('keydown', function (e) {
      if (/^(Arrow|Page|Home|End|Space)/.test(e.key)) nativUebernehmen();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) nativUebernehmen();
    });

    window.addEventListener('resize', function () { target = clamp(target); }, { passive: true });

    return {
      to: function (y) { target = clamp(y); start(); }
    };
  }

  /* Sprungmarken sanft anfahren */
  function scrollToY(y) {
    if (smooth) smooth.to(y);
    else window.scrollTo(0, y);
  }

  /* ── Interaktive Redaktionskarten ───────────────────────────────────
     Team und Ausbildung reagieren wie die großen Karten der Startseite
     auf den Zeiger: minimale perspektivische Neigung plus ein weicher
     Lichtpunkt. Nur auf präzisen Zeigegeräten; Touch bleibt vollständig
     frei fürs Scrollen und reduzierte Bewegung wird respektiert.       */
  (function () {
    var cards = alleEl('[data-interactive-card]');
    if (!cards.length || reduceMotion || !window.matchMedia('(hover:hover) and (pointer:fine)').matches) return;

    cards.forEach(function (card) {
      var frame = 0;
      var px = .5;
      var py = .5;

      function zeichnen() {
        frame = 0;
        card.style.setProperty('--card-x', (px * 100).toFixed(2) + '%');
        card.style.setProperty('--card-y', (py * 100).toFixed(2) + '%');
        card.style.setProperty('--card-rx', ((.5 - py) * 4).toFixed(2) + 'deg');
        card.style.setProperty('--card-ry', ((px - .5) * 5).toFixed(2) + 'deg');
      }

      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        px = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
        py = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
        if (!frame) frame = window.requestAnimationFrame(zeichnen);
      }, { passive: true });

      card.addEventListener('pointerleave', function () {
        if (frame) window.cancelAnimationFrame(frame);
        frame = 0;px = py = .5;zeichnen();
      }, { passive: true });
    });
  })();

  /* ── Navigation ──────────────────────────────────────────────────────
     Blendet beim Runterscrollen aus, beim Hochscrollen wieder ein.
     Schrift- und Pillenfarbe folgen der Sektion unter der Leiste.       */
  var nav = document.getElementById('nav');
  var themed = alleEl('[data-nav-theme]');
  var mobilmenue = document.getElementById('mobilmenue');
  var lastY = window.scrollY;
  var pinnedUntil = 0;
  var loadedAt = Date.now();

  function navPinned() {
    return Date.now() < pinnedUntil ||
           mobilmenue.hasAttribute('data-open') ||
           document.querySelector('.nav__link--menu[aria-expanded="true"]') !== null;
  }

  /* Sprungmarken: Leiste sichtbar halten und sanft hinfahren */
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="#"]');
    if (!a) return;
    pinnedUntil = Date.now() + 1400;

    var id = a.getAttribute('href').slice(1);
    var ziel = id && document.getElementById(id);
    if (!ziel) return;                       /* Abschnitt gibt es noch nicht */
    e.preventDefault();
    var padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    scrollToY(ziel.getBoundingClientRect().top + window.scrollY - padding);
    history.replaceState(null, '', '#' + id);
  });

  function updateTheme() {
    var probe = nav.offsetHeight * 0.6;
    var theme = 'dark';
    themed.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top <= probe && r.bottom > probe) theme = el.dataset.navTheme;
    });
    nav.dataset.theme = theme;
  }

  function updateNav() {
    var y = Math.max(0, window.scrollY);
    var dy = y - lastY;

    /* Beim Laden stellt der Browser die alte Position wieder her – das ist kein Scrollen */
    if (navPinned() || y < 80 || Date.now() - loadedAt < 500) nav.dataset.hidden = 'false';
    else if (dy > 4) nav.dataset.hidden = 'true';
    else if (dy < -4) nav.dataset.hidden = 'false';

    lastY = y;
    updateTheme();
  }

  updateNav();
  window.addEventListener('scroll', gedrosselt(updateNav), { passive: true });
  window.addEventListener('resize', updateTheme, { passive: true });

  /* ── Dropdowns ───────────────────────────────────────────────────── */
  var menuButtons = alleEl('.nav__link--menu');

  function closeMenus(except) {
    menuButtons.forEach(function (btn) {
      if (btn === except) return;
      var panel = document.getElementById(btn.getAttribute('aria-controls'));
      btn.setAttribute('aria-expanded', 'false');
      panel.removeAttribute('data-open');
      window.setTimeout(function () {
        if (btn.getAttribute('aria-expanded') === 'false') panel.hidden = true;
      }, reduceMotion ? 0 : 250);
    });
  }

  menuButtons.forEach(function (btn) {
    var panel = document.getElementById(btn.getAttribute('aria-controls'));

    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') === 'true';
      closeMenus(open ? null : btn);
      if (open) {
        btn.setAttribute('aria-expanded', 'false');
        panel.removeAttribute('data-open');
        window.setTimeout(function () { panel.hidden = true; }, reduceMotion ? 0 : 250);
      } else {
        panel.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
        // Frame abwarten, damit die Einblendung greift
        window.requestAnimationFrame(function () {
          window.requestAnimationFrame(function () { panel.setAttribute('data-open', ''); });
        });
      }
    });

    // Nicht sofort schließen: das Dropdown-Panel sitzt per position:absolute
    // mit sichtbarem Abstand (top:calc(100% + .9rem)) UNTER dem Button, liegt
    // also außerhalb von dessen Layout-Box – bei schneller/diagonaler Maus-
    // bewegung vom Button zum Panel verlässt der Zeiger kurz die ganze Fläche
    // (durch die Lücke), mouseleave feuerte dadurch, BEVOR das Panel erreicht
    // war, und schloss es, bevor ein Klick dort ankommen konnte. Jetzt: beim
    // Verlassen erst kurz warten, ob die Maus (auf Button ODER Panel) wieder
    // hereinkommt – dann bricht mouseenter den Timer ab, statt dass jede
    // kurze Lücken-Durchquerung sofort schließt.
    var closeTimer = null;
    btn.parentNode.addEventListener('mouseleave', function () {
      window.clearTimeout(closeTimer);
      closeTimer = window.setTimeout(function () { closeMenus(); }, 300);
    });
    btn.parentNode.addEventListener('mouseenter', function () {
      window.clearTimeout(closeTimer);
    });
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.nav__item--menu')) closeMenus();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    closeMenus();
    if (burger.getAttribute('aria-expanded') === 'true') toggleMobile(false);
  });

  /* ── Mobilmenü ───────────────────────────────────────────────────── */
  var burger = document.querySelector('.burger');
  var languageSheet = null;

  function closeLanguageSheet() {
    if (!languageSheet) return;
    languageSheet.classList.remove('is-open');
    var trigger = document.querySelector('.mobilmenu__language-trigger');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  }

  function toggleMobile(open) {
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? T.menuSchliessen : T.menuOeffnen);
    document.body.style.overflow = open ? 'hidden' : '';
    nav.dataset.hidden = 'false';

    /* Wie im Vorbild: das Panel bleibt im DOM, nur ein Attribut kippt –
       die eigentliche Animation übernimmt vollständig das CSS. */
    if (open) {
      nav.dataset.theme = 'light';
      mobilmenue.setAttribute('data-open', '');
    } else {
      closeLanguageSheet();
      mobilmenue.removeAttribute('data-open');
      updateTheme();
    }
  }

  burger.addEventListener('click', function () {
    toggleMobile(burger.getAttribute('aria-expanded') !== 'true');
  });
  mobilmenue.addEventListener('click', function (e) {
    if (e.target.closest('a')) toggleMobile(false);
  });

  (function () {
    var source = document.querySelector('.mobilmenu__lang');
    if (!source) return;
    var label = source.previousElementSibling;
    var current = source.querySelector('[aria-current="true"]');
    var nav = source.parentElement;
    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'mobilmenu__language-trigger';
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', 'language-sheet');
    trigger.innerHTML = '<span class="mobilmenu__language-label">Sprache</span><span class="mobilmenu__language-current">' + (current ? current.textContent : '') + '</span><span class="mobilmenu__language-arrow" aria-hidden="true">›</span>';

    if (label && label.classList.contains('mobilmenu__label')) label.classList.add('is-language-source');
    source.classList.add('is-language-source');
    nav.insertBefore(trigger, nav.firstChild);

    languageSheet = document.createElement('section');
    languageSheet.className = 'language-sheet';
    languageSheet.id = 'language-sheet';
    languageSheet.setAttribute('aria-label', label ? label.textContent : 'Sprache');
    var heading = document.createElement('div');
    heading.className = 'language-sheet__heading';
    heading.innerHTML = '<span>' + (label ? label.textContent : 'Sprache') + '</span><button type="button" aria-label="Auswahl schließen">×</button>';
    var options = source.cloneNode(true);
    options.className = 'language-sheet__options';
    options.classList.remove('is-language-source');
    languageSheet.appendChild(heading);
    languageSheet.appendChild(options);
    mobilmenue.appendChild(languageSheet);

    trigger.addEventListener('click', function () {
      var open = languageSheet.classList.toggle('is-open');
      trigger.setAttribute('aria-expanded', String(open));
    });
    heading.querySelector('button').addEventListener('click', closeLanguageSheet);
  })();

  /* ── Öffnungszeiten: Live-Status ─────────────────────────────────────
     Ersetzt den früheren Telefon-Button: zeigt je Standort, ob gerade
     geöffnet ist, und wie lange es noch bis zur nächsten Öffnung dauert.
     data-hours trägt den Wochenplan (Minuten seit Mitternacht, 0=So…6=Sa).
     Rechnet in der Zeitzone Europe/Berlin, unabhängig davon, in welcher
     Zeitzone die Besucherin gerade sitzt. Feiertage sind nicht erkannt
     (kein Feiertagskalender eingebunden) – der Hinweis dazu bleibt als
     reiner Text in der Stundenliste stehen, siehe Kommentar im HTML.    */
  (function () {
    var orte = alleEl('[data-hours]');
    if (!orte.length) return;

    var berlin = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
    });
    var TAGE = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    var WOCHENTAGE = {
      de: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
      en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      cs: ['v neděli', 'v pondělí', 'v úterý', 've středu', 've čtvrtek', 'v pátek', 'v sobotu']
    };

    function jetztInBerlin() {
      var teile = berlin.formatToParts(new Date());
      var map = {};
      teile.forEach(function (t) { map[t.type] = t.value; });
      return { tag: TAGE[map.weekday], minute: parseInt(map.hour, 10) * 60 + parseInt(map.minute, 10) };
    }

    function aktualisieren(el, plan) {
      var status = el.querySelector('[data-status]');
      var text = el.querySelector('[data-status-text]');
      var heuteText = el.querySelector('[data-status-today]');
      var jetzt = jetztInBerlin();
      var heute = plan[jetzt.tag] || [];

      /* Offen? In der heutigen Liste nach einem Zeitraum suchen, der
         die aktuelle Minute einschließt. Bewusst nur das kurze Wort
         ("Geöffnet"/"Geschlossen") statt Uhrzeit/Restdauer – die Zeiten
         stehen daneben ja schon in der Stundenliste im Popup. */
      for (var i = 0; i < heute.length; i++) {
        if (jetzt.minute >= heute[i][0] && jetzt.minute < heute[i][1]) {
          status.setAttribute('data-open', 'true');
          text.textContent = T.geoeffnet;
          if (heuteText) heuteText.textContent = T.heuteBis.replace('{zeit}', zeit(heute[i][1]));
          return;
        }
      }

      status.setAttribute('data-open', 'false');
      text.textContent = T.geschlossen;
      if (!heuteText) return;

      for (var n = 0; n < heute.length; n++) {
        if (jetzt.minute < heute[n][0]) {
          heuteText.textContent = T.heuteAb.replace('{zeit}', zeit(heute[n][0]));
          return;
        }
      }

      for (var tageDanach = 1; tageDanach <= 7; tageDanach++) {
        var naechsterTag = (jetzt.tag + tageDanach) % 7;
        var zeiten = plan[naechsterTag] || [];
        if (!zeiten.length) continue;
        var naechsteZeit = zeit(zeiten[0][0]);
        if (tageDanach === 1) {
          heuteText.textContent = T.morgenAb.replace('{zeit}', naechsteZeit);
        } else {
          heuteText.textContent = T.naechsteOeffnung.replace('{tag}', WOCHENTAGE[SPRACHE][naechsterTag]).replace('{zeit}', naechsteZeit);
        }
        return;
      }

      heuteText.textContent = T.heuteGeschlossen;
    }

    function zeit(minuten) {
      return String(Math.floor(minuten / 60)).padStart(2, '0') + ':' + String(minuten % 60).padStart(2, '0');
    }

    var eintraege = orte.map(function (el) {
      try {
        return { el: el, plan: JSON.parse(el.getAttribute('data-hours')) };
      } catch (err) {
        return null;
      }
    }).filter(Boolean);

    function tick() {
      eintraege.forEach(function (e) { aktualisieren(e.el, e.plan); });
    }
    tick();
    setInterval(tick, 30000);
  })();

  /* ── Mobile Standortkarten ───────────────────────────────────────── */
  alleEl('[data-location-details-toggle]').forEach(function (button) {
    var details = document.getElementById(button.getAttribute('aria-controls'));
    if (!details) return;
    button.addEventListener('click', function () {
      var open = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', open ? 'false' : 'true');
      if (open) {
        details.classList.remove('is-open');
        window.setTimeout(function () { details.hidden = true; }, reduceMotion ? 0 : 380);
      } else {
        details.hidden = false;
        window.requestAnimationFrame(function () { details.classList.add('is-open'); });
      }
    });
  });
  alleEl('.mobile-location-card').forEach(function (card) {
    if (card.querySelector('[data-location-details-toggle]')) return;
    card.classList.add('is-collapsible');
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-expanded', 'false');
    function umschalten() {
      var open = card.classList.toggle('is-expanded');
      card.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    card.addEventListener('click', function (e) {
      if (e.target.closest('a')) return;
      umschalten();
    });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); umschalten(); }
    });
  });
  /* ── Geising-Karte: Pin-Popups ─────────────────────────────────────
     Auf dem Desktop sind beide Popups durchgängig offen – die Karte
     zeigt beide Standorte fest auf einen Blick, der Pin lässt sich dort
     nicht mehr wegklicken. Auf Mobil (Popups fließen dort gestapelt
     unter der Karte statt als Overlay, siehe CSS) bleiben sie dagegen
     zu, bis man den passenden Pin antippt – sonst wäre der erste
     Bildschirm nur Text, kein Blick mehr auf die Karte selbst.
     Die Popups sollen (wie alle anderen Ladeanimationen) erst öffnen,
     wenn die Karte tatsächlich im Bild ist – nicht schon beim Laden der
     Seite, während die Karte noch weit unten außerhalb des Sichtbereichs
     liegt (derselbe Fehler wie beim generischen .reveal-System, nur über
     einen eigenen Codepfad statt is-in). Bewusst nicht am .reveal-System
     selbst angehängt, weil die Karte (.oeff__card) kein .reveal trägt –
     sie soll immer sofort sichtbar sein, nur die Popups verzögert und
     leicht nacheinander aufploppen ("extra revelt", eigenes Timing). */
  (function () {
    var marker = alleEl('.geismap__marker');
    if (!marker.length) return;
    var karte = document.querySelector('.geismap') || marker[0].parentElement;

    function markerOeffnen() {
      marker.forEach(function (m, i) {
        window.setTimeout(function () {
          m.classList.add('is-open');
          var pin = m.querySelector('.geismap__pin');
          if (pin) pin.setAttribute('aria-expanded', 'true');
        }, reduceMotion ? 0 : i * 150);
      });
    }

    var istDesktop = window.matchMedia('(min-width: 641px)').matches;

    if (istDesktop) {
      if (reduceMotion) {
        markerOeffnen();
        return;
      }

      var abmelden = null;
      var geoeffnet = false;

      function pruefen() {
        if (!imBild(karte)) return; // noch nicht dran
        geoeffnet = true;
        markerOeffnen();
        if (abmelden) abmelden();
      }

      pruefen(); // Anfangszustand – falls die Karte schon im Bild ist
      if (!geoeffnet) abmelden = beiScrollUndResize(pruefen);
      return; /* auf dem Desktop bleibt es danach dabei, kein Klick-Handler nötig */
    }

    marker.forEach(function (m) {
      var pin = m.querySelector('.geismap__pin');
      if (!pin) return;
      pin.addEventListener('click', function (e) {
        e.stopPropagation();
        var offen = m.classList.toggle('is-open');
        pin.setAttribute('aria-expanded', offen ? 'true' : 'false');
      });
    });
  })();

  /* ── Historie: horizontale Zeitleiste ─────────────────────────────────
     Baut die Zeitleisten-Mechanik von modernbakery.com/our-story nach
     (dort per GSAP ScrollTrigger + Lenis, hier ohne fremde Bibliothek):
     ein hoher "Spacer" gibt Scroll-Strecke her, ein position:sticky-
     Fenster bleibt stehen, und ein rAF-Scroll-Handler berechnet daraus
     einen Fortschritt 0–1, den er als horizontales Verschieben der
     Zeitleiste anwendet. Die Intro-Karte (.storyhz__intro, erste Karte
     im Track) braucht dabei kein eigenes JS – sie blendet über das
     allgemeine .reveal-System ein.

     NEU (aus den echten GSAP-ScrollTrigger-Vars des Vorbilds ausgelesen,
     nicht mehr nur geschätzt – siehe Projektnotizen für die volle
     Introspektion per ScrollTrigger.getAll()/anim.vars): jeder
     Zeitstrahl-Punkt bekommt drei einzelne Einblend-Trigger – Jahr bei
     75% Bildschirmbreite, Titel bei 70%, Punkt ebenfalls bei 70%, je
     einmalig über eigene is-in-year/-title/-dot-Klassen (siehe styles.css
     für Timing/Easing/Zielzustände je Teil). Das Foto bekommt dort KEINEN
     Einmal-Trigger, sondern eine per Scroll-Fortschritt "geschrubbte"
     Rotation (ease:none, scrub:true) zwischen 60% und 40% Bildschirm-
     breite – dreht sich also gleichmäßig MIT dem Scrollen. Dafür gibt es
     hier keine is-in-img-Klasse mehr, sondern eine direkt pro Tick
     berechnete Inline-Rotation (siehe rotStart/rotEnd unten).

     Bewusst KEIN horizontales Scroll-Hijacking auf Mobil: auf einem
     Touch-Screen kein Vergnügen. Aber (Kundenwunsch „auch mobil 1:1
     nachbauen"): das Vorbild deaktiviert unterhalb 992px zwar den
     horizontalen Pin, NICHT aber die einzelnen Jahr/Titel/Punkt/Foto-
     Trigger selbst – die laufen dort unverändert weiter (identische
     `anim.vars`/Trigger-Zahl bei 375/768/1280px per Introspektion
     bestätigt, siehe Projektnotizen), nur eben an normalem senkrechtem
     statt horizontal-gejacktem Scroll gemessen ("top X%" heißt dann
     wieder wörtlich X % der Fensterhöhe statt unserer Breiten-Umrechnung
     fürs Desktop-Pinning). Deshalb unten ein zweiter, eigenständiger
     Vertikal-Handler statt eines reinen `data-static`-Kurzschlusses.
     NUR bei reduzierter Bewegung bleibt es komplett bewegungslos (siehe
     [data-nomotion] in styles.css) – wer keine Bewegung möchte, soll auch
     keine bekommen, das war schon vorher so und bleibt bestehen. */
  (function () {
    var story = document.getElementById('historie');
    if (!story) return;

    function clamp01(n) { return Math.max(0, Math.min(1, n)); }

    if (reduceMotion) {
      story.setAttribute('data-static', '');
      story.setAttribute('data-nomotion', '');
      return;
    }

    /* 992px = exakt der Breakpoint, ab dem das Vorbild (GSAP-ScrollTrigger-
       Introspektion, siehe Projektnotizen) das horizontale Scroll-Jacking
       selbst aktiviert (matchMedia dort intern ebenfalls auf 992px). */
    var schmal = !window.matchMedia('(min-width: 992px)').matches;
    if (schmal) {
      story.setAttribute('data-static', '');

      var itemsV = alleEl('[data-storyhz-item]', story);
      var bilderV = itemsV.map(function (item) { return item.querySelector('.storyhz__image'); });

      function updateVertikal() {
        var hoeheFenster = window.innerHeight;
        var schwelleYear = hoeheFenster * 0.75;
        var schwelleTitle = hoeheFenster * 0.70;
        var schwelleDot = hoeheFenster * 0.70;
        var rotStart = hoeheFenster * 0.60;
        var rotEnd = hoeheFenster * 0.40;
        itemsV.forEach(function (item, i) {
          var oben = item.getBoundingClientRect().top;
          if (!item.classList.contains('is-in-dot') && oben < schwelleDot) item.classList.add('is-in-dot');
          if (!item.classList.contains('is-in-year') && oben < schwelleYear) item.classList.add('is-in-year');
          if (!item.classList.contains('is-in-title') && oben < schwelleTitle) item.classList.add('is-in-title');

          var bild = bilderV[i];
          if (bild) {
            var t = clamp01((rotStart - oben) / (rotStart - rotEnd));
            bild.style.transform = 'rotate(' + (-3 + t * 6) + 'deg)';
          }
        });
      }

      beiScrollUndResize(updateVertikal);
      updateVertikal();
      return;
    }

    /* ── Horizontale Zeitleiste ── */
    var hz = story.querySelector('[data-storyhz]');
    var spacer, track, line, items, bilder, maxShift = 0;
    if (hz) {
      spacer = hz.querySelector('.storyhz__spacer');
      track = hz.querySelector('[data-storyhz-track]');
      line = hz.querySelector('[data-storyhz-line]');
      items = alleEl('[data-storyhz-item]', hz);
      bilder = items.map(function (item) { return item.querySelector('.storyhz__image'); });

      var messen = function () {
        var breite = track.scrollWidth;
        maxShift = Math.max(0, breite - window.innerWidth);
        line.style.width = breite + 'px';
        /* 1px Scroll ≈ 1px horizontale Bewegung, plus eine Bildschirmhöhe
           Vorlauf zum Ein- und Ausblenden am Anfang/Ende. */
        spacer.style.height = (window.innerHeight + maxShift) + 'px';
      };
      messen();
      window.addEventListener('load', messen);
      window.addEventListener('resize', messen, { passive: true });
    }

    function updateHz() {
      if (!hz) return;
      var r = spacer.getBoundingClientRect();
      var range = r.height - window.innerHeight;
      var progress = range > 0 ? clamp01(-r.top / range) : 0;
      track.style.transform = 'translateX(' + (-progress * maxShift) + 'px)';

      var breiteFenster = window.innerWidth;
      var schwelleYear = breiteFenster * 0.75;
      var schwelleTitle = breiteFenster * 0.70;
      var schwelleDot = breiteFenster * 0.70;
      /* Foto-Rotation: kein Einmal-Trigger, sondern ein durchgehender
         Fortschritt zwischen zwei Schwellen (60%/40% Bildschirmbreite,
         1:1 vom Vorbild), linear auf -3deg…3deg abgebildet – "ease:none,
         scrub:true" lässt sich hier am einfachsten als direkte, ungefederte
         Inline-Rotation pro Scroll-Tick nachbauen statt über eine
         CSS-Transition (die würde bei jedem Tick neu anspringen). */
      var rotStart = breiteFenster * 0.60;
      var rotEnd = breiteFenster * 0.40;
      items.forEach(function (item, i) {
        var links = item.getBoundingClientRect().left;
        if (!item.classList.contains('is-in-dot') && links < schwelleDot) item.classList.add('is-in-dot');
        if (!item.classList.contains('is-in-year') && links < schwelleYear) item.classList.add('is-in-year');
        if (!item.classList.contains('is-in-title') && links < schwelleTitle) item.classList.add('is-in-title');

        var bild = bilder[i];
        if (bild) {
          var t = clamp01((rotStart - links) / (rotStart - rotEnd));
          bild.style.transform = 'rotate(' + (-3 + t * 6) + 'deg)';
        }
      });
    }

    beiScrollUndResize(updateHz);
    updateHz();
  })();

  /* ── Footer: aktuelles Jahr ────────────────────────────────────────── */
  var jahrEl = document.querySelector('[data-year]');
  if (jahrEl) jahrEl.textContent = new Date().getFullYear();

  /* ── Kontaktformular ───────────────────────────────────────────────
     Statische Seite ohne eigenes Backend für Formulare (server.js
     liefert nur Dateien aus) – "Nachricht senden" öffnet stattdessen
     das E-Mail-Programm mit vorausgefüllter Nachricht. Kein echtes
     AJAX-Versenden, aber ohne Server die einzige Lösung, die überall
     zuverlässig funktioniert. */
  (function () {
    var form = document.querySelector('[data-kontakt-form]');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = form.name.value.trim();
      var email = form.email.value.trim();
      var telefon = form.telefon.value.trim();
      var nachricht = form.nachricht.value.trim();
      var zeilen = ['Name: ' + name];
      if (telefon) zeilen.push('Telefon: ' + telefon);
      zeilen.push('E-Mail: ' + email, '', nachricht);
      var url = 'mailto:nestler-baecker@web.de'
        + '?subject=' + encodeURIComponent('Nachricht über die Website von ' + name)
        + '&body=' + encodeURIComponent(zeilen.join('\n'));
      window.location.href = url;
    });
  })();

  /* ── Ausbildung: geführte Bewerbung ────────────────────────────────
     Der Ablauf bleibt vollständig lokal. Erst der abschließende, klar
     bezeichnete Link öffnet das E-Mail-Programm; bis dahin werden keine
     Angaben übertragen. Das ist für die statische Website ehrlicher und
     zuverlässiger als ein scheinbarer AJAX-Versand ohne Backend. */
  (function () {
    var flow = document.querySelector('[data-application-flow]');
    if (!flow) return;

    var form = flow.querySelector('[data-application-form]');
    var stage = flow.querySelector('[data-application-stage]');
    var controls = flow.querySelector('[data-application-controls]');
    var steps = alleEl('[data-application-step]', flow);
    var progressSteps = alleEl('[data-progress-step]', flow);
    var progress = flow.querySelector('[data-application-progress]');
    var next = flow.querySelector('[data-application-next]');
    var back = flow.querySelector('[data-application-back]');
    var submit = flow.querySelector('[data-application-submit]');
    var count = flow.querySelector('[data-application-count]');
    var success = flow.querySelector('[data-application-success]');
    var mailLink = flow.querySelector('[data-application-mail-link]');
    var edit = flow.querySelector('[data-application-edit]');
    var shell = flow.querySelector('.application-flow__shell');
    var current = 0;

    function invalidBewegen() {
      shell.classList.remove('is-invalid');
      void shell.offsetWidth;
      shell.classList.add('is-invalid');
      window.setTimeout(function () { shell.classList.remove('is-invalid'); }, 450);
    }

    function stepGueltig(step) {
      var fields = alleEl('input,textarea,select', step);
      for (var i = 0; i < fields.length; i += 1) {
        if (!fields[i].checkValidity()) {
          invalidBewegen();
          fields[i].reportValidity();
          return false;
        }
      }
      return true;
    }

    function zeigen(index, fokus) {
      current = Math.max(0, Math.min(steps.length - 1, index));
      steps.forEach(function (step, i) { step.hidden = i !== current; });
      progressSteps.forEach(function (item, i) {
        item.classList.toggle('is-active', i === current);
        item.classList.toggle('is-complete', i < current);
        if (i === current) item.setAttribute('aria-current', 'step');
        else item.removeAttribute('aria-current');
      });
      flow.style.setProperty('--app-progress', ((current + 1) / steps.length).toFixed(3));
      if (progress) progress.style.transform = 'scaleX(' + ((current + 1) / steps.length).toFixed(3) + ')';
      back.disabled = current === 0;
      next.hidden = current === steps.length - 1;
      submit.hidden = current !== steps.length - 1;
      count.textContent = (current + 1) + ' / ' + steps.length;
      if (fokus) {
        var heading = steps[current].querySelector('h3');
        if (heading) window.setTimeout(function () { heading.focus({ preventScroll: true }); }, 80);
      }
    }

    next.addEventListener('click', function () {
      if (stepGueltig(steps[current])) zeigen(current + 1, true);
    });
    back.addEventListener('click', function () { zeigen(current - 1, true); });

    form.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA') return;
      if (current >= steps.length - 1) return;
      e.preventDefault();
      next.click();
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      for (var i = 0; i < steps.length; i += 1) {
        if (!stepGueltig(steps[i])) { zeigen(i, false);return; }
      }

      var beruf = form.elements.beruf.value;
      var name = form.elements.name.value.trim();
      var email = form.elements.email.value.trim();
      var telefon = form.elements.telefon.value.trim();
      var motivation = form.elements.motivation.value.trim();
      var zeilen = [
        'Bewerbung für: ' + beruf,
        '',
        'Name: ' + name,
        'E-Mail: ' + email
      ];
      if (telefon) zeilen.push('Telefon: ' + telefon);
      zeilen.push('', 'Motivation:', motivation, '', 'Viele Grüße', name);
      mailLink.href = 'mailto:nestler-baecker@web.de'
        + '?subject=' + encodeURIComponent('Bewerbung Ausbildung: ' + beruf + ' – ' + name)
        + '&body=' + encodeURIComponent(zeilen.join('\n'));

      stage.hidden = true;
      controls.hidden = true;
      success.hidden = false;
      flow.style.setProperty('--app-progress', '1');
      if (progress) progress.style.transform = 'scaleX(1)';
      progressSteps.forEach(function (item) {
        item.classList.remove('is-active');item.classList.add('is-complete');item.removeAttribute('aria-current');
      });
      var successHeading = success.querySelector('h3');
      if (successHeading) window.setTimeout(function () { successHeading.focus({ preventScroll: true }); }, 80);
    });

    edit.addEventListener('click', function () {
      success.hidden = true;stage.hidden = false;controls.hidden = false;zeigen(steps.length - 1, true);
    });

    alleEl('[data-choose-role]').forEach(function (button) {
      button.addEventListener('click', function () {
        var value = button.getAttribute('data-choose-role');
        var radios = alleEl('input[name="beruf"]', form);
        radios.forEach(function (radio) { radio.checked = radio.value === value;});
        success.hidden = true;stage.hidden = false;controls.hidden = false;zeigen(0, false);
        var padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
        scrollToY(flow.getBoundingClientRect().top + window.scrollY - padding);
      });
    });

    zeigen(0, false);
  })();

  /* ── Sonderwünsche: Wortliste ────────────────────────────────────────
     Das durchlaufende Wortband selbst ist weiterhin reine CSS-Keyframe-
     Animation (@keyframes sw-roll auf .sw__words-list, festes Fenster +
     Maske auf .sw__words – siehe styles.css). Alle früheren JS-Varianten
     dafür (scroll-gekoppelte Maske, setInterval-Rotator, Sichtbarkeits-
     Trigger) sind ersatzlos entfernt: sie liefen dem seiteneigenen Smooth-
     Scroll auf dem Hauptthread in die Quere (erzwangen Layout-Reads pro
     Tick/Scroll-Event) und haben genau deshalb gestockt, ungleichmäßig
     getickt oder gar nicht gestartet. Die CSS-Fassung läuft auf dem
     Compositor, startet ohne Trigger und ist durch `linear` konstruktions-
     bedingt gleichmäßig.

     Kundenwunsch (zweiter Anlauf): nicht nur kurz schneller werden, sondern
     sich wirklich mit der Maus nach oben UND unten schieben lassen – wie ein
     Griff an einem Endlosband. Erster Versuch (nur playbackRate hochsetzen)
     konnte keine Richtung, nur Tempo – daher jetzt direktes Scrubbing über
     Animation.currentTime (Web Animations API): das ist exakt der Zeit-
     punkt innerhalb der Animation, an dem sie gerade steht, und lässt sich
     wie ein Schieberegler in beide Richtungen setzen – dieselbe API-Klasse
     wie schon der Geschwindigkeits-Ansatz, also weiterhin ohne jeden Layout-
     Read pro Bewegung (nur eine einzige Höhen-Messung ganz zu Beginn der
     Geste) und ohne Kollision mit dem Smooth-Scroll.
     Da die Animation endlos läuft (infinite), rechnet der Browser
     currentTime intern automatisch modulo der Laufzeit – für die Richtung
     "nach oben" (höheres currentTime) reicht das direkte Hochzählen. Für
     "nach unten" (Kundenzitat: "nach oben ist es ein wenig schwieriger" –
     zu Recht, denn currentTime unter 0 zeigt in vielen Browsern nur den
     ersten Frame an, läuft NICHT rückwärts durch die vorherige Runde)
     wird deshalb selbst modulo gerechnet (wrap-Funktion unten), damit sich
     auch abwärts endlos weiterziehen lässt. */
  (function () {
    var wrap = document.querySelector('.sw__words');
    var list = document.querySelector('.sw__words-list');
    if (!wrap || !list) return;
    var mqSmall = window.matchMedia('(max-width: 900px)');

    function getAnim() {
      var anims = list.getAnimations ? list.getAnimations() : [];
      return anims[0] || null;
    }
    function wrapTime(t, dur) {
      var r = t % dur;
      return r < 0 ? r + dur : r;
    }

    // Kundenfeedback: "mehr Widerstand" (1:1 wirkte zu leichtgängig) und
    // "nicht die ganze Zeit alles markieren". WIDERSTAND = Faktor < 1 auf
    // die Mausbewegung, bevor sie in Animationszeit umgerechnet wird –
    // dieselbe Zeigerstrecke bewegt das Band jetzt nur noch auf einen Teil
    // der bisherigen Distanz, fühlt sich also "schwerer" an. MARKIEREN wird
    // über zwei Wege unterbunden: CSS `user-select:none` (styles.css) UND
    // `e.preventDefault()` hier im pointerdown – Browser starten die native
    // Text-Selektion schon beim ersten Maus-Down, CSS allein kommt in
    // manchen Browsern erst einen Tick zu spät. Dafür darf der pointerdown-
    // Listener NICHT passiv sein (passive Listener dürfen preventDefault
    // nicht aufrufen); pointermove/pointerup bleiben passiv, die greifen
    // nicht in die Selektion ein.
    var WIDERSTAND = 0.6;
    var dragging = false, startY = 0, dragStartTime = 0, msPerPx = 0, durMs = 0, moved = false;

    // Kundenwunsch (nach Live-Analyse von modernbakery.com, ".client-marquee"/
    // "We bake for:"-Logoreihe – dort per GSAP Draggable + InertiaPlugin
    // umgesetzt, bestätigt über window.gsap/window.InertiaPlugin sowie den
    // laufenden Tween auf der Marquee-Spur): "cool" ist dort vor allem der
    // Schwung nach dem Loslassen – die Reihe läuft nach dem Ziehen weiter
    // und bremst sanft aus, statt abrupt zu stoppen. Hier ohne GSAP als
    // eigenes kleines Trägheits-Modell nachgebaut: waehrend des Ziehens wird
    // die Geschwindigkeit der letzten Bewegung gemessen, beim Loslassen läuft
    // sie in einem kurzen Ausklang-Takt weiter und wird dabei abgebremst
    // (Reibung), bevor nahtlos wieder auf den normalen Automatik-Lauf
    // übergeben wird. Bewusst setInterval statt requestAnimationFrame fürs
    // Austakten – gleicher, in diesem Projekt bereits bewährter Grund wie
    // überall sonst: zuverlässig auslösend, und da hier (wie beim Drag
    // selbst) kein Layout gelesen wird, entsteht keine der früheren
    // Kollisionen mit dem Smooth-Scroll.
    // Kundenfeedback: "nach dem Drehen macht es immer eine Pause" – mit
    // FRICTION .93 + COAST_STOP_AT .02 lief der Nachlauf so lange nach, dass
    // er zum Schluss viele Takte lang nur noch Bruchteile eines Pixels pro
    // Tick bewegte – technisch noch "am Laufen", aber optisch nicht mehr von
    // Stillstand zu unterscheiden, bevor er zurück in den Automatik-Lauf
    // übergab. Fühlte sich dadurch wie eine Pause vor dem Weiterlaufen an.
    // Jetzt: staerkere Reibung (kuerzerer Ausklang insgesamt) UND ein
    // frueherer Abbruchpunkt (uebergibt schon, waehrend noch sichtbar
    // Bewegung da ist, statt bis ins fast Unsichtbare zu verklingen).
    var lastMoveY = 0, lastMoveT = 0, velocityPxPerMs = 0;
    var coastTimer = null;
    var FRICTION = 0.87;         // Abbremsfaktor pro Takt (vorher .93 – deutlich kuerzerer Nachlauf)
    var COAST_STEP_MS = 16;      // Taktdauer
    var COAST_STOP_AT = 0.15;    // fruehere Uebergabe (vorher .02 – kein unsichtbares Nachschleichen mehr)
    var MAX_START_MS_PER_STEP = 260; // deckelt einen sehr harten Flick

    function stopCoast() {
      if (coastTimer) { window.clearInterval(coastTimer); coastTimer = null; }
    }

    function onDown(e) {
      if (reduceMotion || mqSmall.matches) return;
      var a = getAnim();
      if (!a) return;
      e.preventDefault();
      stopCoast();
      dragging = true; moved = false;
      startY = e.clientY;
      lastMoveY = e.clientY; lastMoveT = e.timeStamp; velocityPxPerMs = 0;
      // Einmalige Messung zu Gestenbeginn, in onMove NICHT wiederholt:
      // Laufstrecke ist die halbe Listenhöhe (0 → -50% in den Keyframes).
      durMs = parseFloat(getComputedStyle(list).animationDuration) * 1000;
      var travelPx = list.getBoundingClientRect().height / 2;
      msPerPx = travelPx > 0 ? durMs / travelPx : 0;
      dragStartTime = a.currentTime || 0;
      a.pause();
      wrap.classList.add('is-dragging');
    }
    function onMove(e) {
      if (!dragging) return;
      var a = getAnim();
      if (!a) return;
      var deltaY = e.clientY - startY;
      if (!moved && Math.abs(deltaY) < 3) return; // Mini-Zittern ignorieren
      moved = true;
      // Nach UNTEN ziehen soll den Inhalt nach UNTEN mitnehmen (wie beim
      // Ziehen eines Vorhangs) → sinkendes currentTime; nach OBEN ziehen
      // schiebt weiter in die normale Laufrichtung → steigendes currentTime.
      // WIDERSTAND bremst die Übersetzung Maus- in Animationsstrecke.
      a.currentTime = wrapTime(dragStartTime - deltaY * msPerPx * WIDERSTAND, durMs);
      // Momentgeschwindigkeit für den Schwung beim Loslassen (nur die letzte
      // Bewegung zählt, kein Mittelwert über die ganze Geste – fühlt sich
      // direkter an, entspricht auch dem, was ein Flick am Ende tatsächlich
      // ausmacht).
      var dt = e.timeStamp - lastMoveT;
      if (dt > 0) { velocityPxPerMs = (e.clientY - lastMoveY) / dt; }
      lastMoveY = e.clientY; lastMoveT = e.timeStamp;
    }
    function onUp() {
      if (!dragging) return;
      dragging = false;
      wrap.classList.remove('is-dragging');
      var a = getAnim();
      if (!a) return;
      if (!moved || reduceMotion) { a.play(); return; }
      // Startschwung aus der zuletzt gemessenen Zeiger-Geschwindigkeit,
      // in dieselbe ms/Schritt-Größe umgerechnet wie das Ziehen selbst
      // (gleiches Vorzeichen-/Widerstands-Prinzip), dann gedeckelt.
      var rawStep = -velocityPxPerMs * msPerPx * WIDERSTAND * COAST_STEP_MS;
      rawStep = Math.max(-MAX_START_MS_PER_STEP, Math.min(MAX_START_MS_PER_STEP, rawStep));
      // Kundenfeedback "macht immer noch eine kleine Pause": Ursache war NICHT
      // die Ausklingdauer, sondern dass der Nachlauf bis auf (fast) null
      // abbremste und DANACH abrupt auf das volle Automatik-Tempo sprang –
      // dieser Tempo-Sprung selbst liest sich als kurzes Stocken, egal wie
      // kurz die Ausklingzeit ist. Jetzt klingt nur noch die ABWEICHUNG vom
      // normalen Lauftempo (NORMAL_STEP = ein Tick bei Tempo 1) ab, nicht der
      // Schwung als Ganzes – die Geschwindigkeit nähert sich damit stufenlos
      // dem normalen Automatik-Tempo an, statt über null zu laufen. Bei
      // Loslassen in Zieh-Richtung (schneller als normal) wird also sanft
      // gebremst; bei Loslassen entgegen der Zieh-Richtung bremst es
      // erwartungsgemäß bis zum kurzen Richtungswechsel ab, bevor es wieder
      // vom Normaltempo "mitgenommen" wird – genau wie ein echtes Anschieben
      // gegen eine laufende Fließstrecke.
      var NORMAL_STEP = COAST_STEP_MS; // Tempo 1: 1ms Animationszeit pro 1ms Realzeit
      var extra = rawStep - NORMAL_STEP;
      if (Math.abs(extra) < COAST_STOP_AT) { a.play(); return; }
      stopCoast();
      coastTimer = window.setInterval(function () {
        a.currentTime = wrapTime((a.currentTime || 0) + NORMAL_STEP + extra, durMs);
        extra *= FRICTION;
        if (Math.abs(extra) < COAST_STOP_AT) { stopCoast(); a.play(); }
      }, COAST_STEP_MS);
    }

    wrap.addEventListener('pointerdown', onDown); // NICHT passive – siehe oben
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onUp, { passive: true });
  })();

  /* ── Ladeanimation / Scroll-Reveal ────────────────────────────────────
     .reveal-Elemente (siehe styles.css) starten unsichtbar/leicht versetzt
     und blenden per .is-in-Klasse sanft ein, sobald sie tatsächlich im
     sichtbaren Bereich sind – dadurch "laden" Inhalte ein, während man zu
     ihnen scrollt, statt schon beim Seitenaufruf (unsichtbar, weil noch
     off-screen) zu animieren.
     Kundenfeedback: die Animation löste im echten Browser NIE beim normalen
     Scrollen aus, Inhalte waren schon "fertig eingeblendet", sobald man
     hinscrollte. Ursache war ein Sicherheitsnetz-Timeout weiter unten
     (window.setTimeout(...,4000)), das ALLE noch wartenden .reveal-Elemente
     nach 4 Sekunden zwangsweise auf is-in setzte – unabhängig davon, ob sie
     überhaupt im Bild waren. Da ein Nutzer beim normalen Lesen der Seite
     praktisch immer länger als 4s braucht, bevor er zu weiter unten
     liegenden Sektionen scrollt, waren diese beim Erreichen längst (unsicht-
     bar früh) enthüllt – daher keine sichtbare Animation. Der eigentliche
     Scroll-Mechanismus (rAF-gedrosselte getBoundingClientRect()-Prüfung,
     dasselbe bewährte Muster wie beim Historie-Zeitstrahl) war die ganze
     Zeit korrekt; das Sicherheitsnetz wurde entfernt, damit .reveal-
     Elemente wirklich erst beim tatsächlichen Erreichen einblenden. */
  (function () {
    var pending = alleEl('.reveal');
    if (!pending.length) return;
    if (reduceMotion) {
      pending.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }

    var abmelden = null;

    function pruefen() {
      pending = pending.filter(function (el) {
        if (!imBild(el)) return true;      // noch nicht dran
        el.classList.add('is-in');
        return false;
      });
      if (!pending.length && abmelden) abmelden();
    }

    function start() {
      pruefen(); // Anfangszustand – zeigt sofort, was schon im Bild ist (Hero)
      if (pending.length) abmelden = beiScrollUndResize(pruefen);
    }
    // WICHTIG (Ursache des eigentlichen Bugs): erst starten, wenn die
    // Web-Font geladen ist. Vorher rendert der Browser mit einer Fallback-
    // Schrift (anderer Zeilenumbruch/andere Zeilenhöhe), die Seite ist zu
    // diesem sehr frühen Zeitpunkt oft KÜRZER als final – eine sofortige
    // Prüfung stufte dadurch Elemente fälschlich als "schon im Bild" ein
    // und strich sie unwiderruflich aus der Warteliste, obwohl sie nach dem
    // Font-Swap tatsächlich weit unten lagen. Genau das hat sich als "die
    // Animation läuft beim normalen Scrollen nie" gezeigt – sie war ja
    // (fälschlich, unsichtbar früh) schon "erledigt". document.fonts.ready
    // sorgt dafür, dass erst nach dem Schrift-Swap (nicht erst nach dem
    // Laden ALLER Bilder wie bei window.load, das spürbar länger dauern
    // könnte) gemessen wird – Bilder haben in diesem Projekt ohnehin überall
    // feste width/height-Attribute und verschieben das Layout nicht nach.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(start);
    } else {
      start();
    }
  })();

  /* ── Schautorten: Kategorie-Browser ───────────────────────────────────
     1:1-Nachbau der Kategorie-Sektion von modernbakery.com/products.
     Grundlage ist diesmal nicht nur die ausgelesene CSS-Anatomie, sondern
     das Original-Skript des Vorbilds selbst (steckt dort als Inline-Skript
     in der Seite; per DOM-Zugriff ausgelesen). Dessen Ablauf:

       setActive(index)
         · Kategorienliste: .is-active auf Eintrag, Punkt und Titel
         · Textblock:  eintretend  von opacity 0 / y +20 → 0.4s power2.out
                       verlassend  auf opacity 0 / y −20 → 0.3s power2.in
         · Bild:       eintretend  von scale .7 / rotate −20° auf 1 / 0°
                                   → 0.85s back.out(1.7), danach Schweben
                       schwebend   y +=10px, 2s sine.inOut, hin und zurück
                       verlassend  auf scale .8 / rotate 10° → 0.4s
                                   power2.in, Schweben aus mit 0.45s sine.out
       Desktop
         · je Bildkachel ein ScrollTrigger "top center"/"bottom center",
           der setActive auslöst  → hier: nächstliegende Kachel zur
           Bildschirmmitte, was bei gleich hohen, lückenlosen Kacheln
           dasselbe Ergebnis liefert
         · Einrasten: 90 ms nachdem das Scrollen zur Ruhe kommt, wird die
           nächstliegende Kachel mittig gezogen, danach 750 ms Sperre
         · Listeneintrag und Pfeile scrollen zur jeweiligen Kachel
       Mobil/Tablet (< 992px)
         · kein Scrollbezug; Mausrad (Schwelle 10) und Wischen (Schwelle
           25) schalten weiter, 280 ms Sperre je Wechsel; an den Enden
           wird das Ereignis durchgelassen, damit die Seite normal
           weiterscrollt

     Aufgeteilt wie im Projekt üblich: alles Gestalterische (Kurven,
     Dauern, Keyframes) steckt im CSS, dieses Skript setzt nur Klassen und
     kümmert sich um Scrollposition und Gesten. Die Kurven selbst sind im
     CSS als abgetastete linear()-Kurven hinterlegt, siehe .stcat dort.

     Fürs Einrasten und die Sprünge wird bewusst der projekteigene
     scrollToY()/Smooth-Scroll genutzt statt einer zweiten Scroll-Schleife
     – eine eigene rAF-Schleife daneben ist genau die Konstruktion, die in
     diesem Projekt schon mehrfach zu Rucklern geführt hat. Einziger
     Unterschied zum Vorbild dadurch: dort rastet es mit back.out(1.7)
     ein, hier mit der Kurve des Projekt-Smooth-Scrolls. */
  (function () {
    var stcat = document.querySelector('[data-stcat]');
    if (!stcat) return;

    var navs   = alleEl('[data-stcat-nav]', stcat);
    var subs   = alleEl('.stcat__sub-item', stcat);
    var slides = alleEl('.stcat__scroll-item', stcat);
    var scrollSpalte = stcat.querySelector('.stcat__scroll');
    var aktuellEl = stcat.querySelector('[data-stcat-current]');
    var gesamtEl  = stcat.querySelector('[data-stcat-total]');
    var listeEl   = stcat.querySelector('[data-stcat-list]');

    var gesamt = slides.length;
    if (!gesamt) return;

    function zwei(n) { return (n < 10 ? '0' : '') + n; }
    if (gesamtEl) gesamtEl.textContent = zwei(gesamt);

    var index = -1;

    function setzen(i) {
      i = Math.max(0, Math.min(gesamt - 1, i));
      if (i === index) return;
      index = i;
      navs.forEach(function (el, n) {
        var aktiv = n === i;
        el.classList.toggle('is-active', aktiv);
        el.setAttribute('aria-pressed', aktiv ? 'true' : 'false');
      });
      subs.forEach(function (el, n) {
        var aktiv = n === i;
        el.classList.toggle('is-active', aktiv);
        el.setAttribute('aria-hidden', aktiv ? 'false' : 'true');
      });
      slides.forEach(function (el, n) {
        var aktiv = n === i;
        el.classList.toggle('is-active', aktiv);
        el.setAttribute('aria-hidden', aktiv ? 'false' : 'true');
      });
      if (aktuellEl) aktuellEl.textContent = zwei(i + 1);
    }

    /* Dieselbe Bedingung wie die Media-Query in styles.css – so können
       Layout und Verhalten nicht auseinanderlaufen. */
    var statischMQ = window.matchMedia('(max-width: 991px), (prefers-reduced-motion: reduce)');
    function istStatisch() { return reduceMotion || statischMQ.matches; }

    function mitteVon(i) {
      var r = slides[i].getBoundingClientRect();
      return Math.round(window.scrollY + r.top + r.height / 2 - window.innerHeight / 2);
    }

    function naechsterIndex() {
      var mitte = (window.innerHeight || document.documentElement.clientHeight) / 2;
      var beste = 0, besteDistanz = Infinity;
      for (var i = 0; i < slides.length; i++) {
        var r = slides[i].getBoundingClientRect();
        var d = Math.abs(r.top + r.height / 2 - mitte);
        if (d < besteDistanz) { besteDistanz = d; beste = i; }
      }
      return beste;
    }

    function springen(i) {
      i = Math.max(0, Math.min(gesamt - 1, i));
      if (istStatisch()) { setzen(i); return; }
      scrollToY(mitteVon(i));
    }

    navs.forEach(function (btn, n) {
      btn.addEventListener('click', function () { springen(n); });
    });
    alleEl('[data-stcat-dir]', stcat).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var ziel = index + parseInt(btn.getAttribute('data-stcat-dir'), 10);
        if (ziel < 0) ziel = gesamt - 1;
        if (ziel >= gesamt) ziel = 0;
        springen(ziel);
      });
    });

    /* ── Scroll-Kopplung + Einrasten (nur Desktop) ── */
    var rastetEin = false, einrastTimer = null;

    function einrasten() {
      if (rastetEin || istStatisch()) return;
      /* Nur einrasten, solange die Bildschirmmitte tatsächlich in der
         Bilderspalte liegt – sonst würde die Sektion den Nutzer beim
         Vorbeiscrollen zurückziehen. Das Vorbild prüft dafür einen
         Sichtbarkeitsanteil von 20 %; diese Rechnung geht dort nur auf,
         weil es fünf Kacheln sind (900/4500 = genau 0,2). Bei acht
         Kacheln käme man nie über 0,125 und es würde nie einrasten –
         deshalb hier die Bedingung, die offensichtlich gemeint war. */
      var r = scrollSpalte.getBoundingClientRect();
      var mitte = (window.innerHeight || document.documentElement.clientHeight) / 2;
      if (r.top > mitte || r.bottom < mitte) return;

      /* Nur zwischen der ersten und der letzten Kachelmitte einrasten.
         Ohne das gäbe es am Anfang und am Ende je ein halbes Fenster, in
         dem man beim Weiterscrollen wieder zurückgezogen würde – man käme
         nur schwer aus der Sektion heraus. */
      var oben = mitteVon(0), unten = mitteVon(gesamt - 1);
      if (window.scrollY < oben - 1 || window.scrollY > unten + 1) return;

      var ziel = mitteVon(naechsterIndex());
      if (Math.abs(ziel - window.scrollY) < 2) return;

      rastetEin = true;
      scrollToY(ziel);
      window.setTimeout(function () { rastetEin = false; }, 750);
    }

    function pruefen() {
      if (istStatisch()) return;
      setzen(naechsterIndex());
      if (rastetEin) return;
      window.clearTimeout(einrastTimer);
      einrastTimer = window.setTimeout(einrasten, 90);
    }

    beiScrollUndResize(pruefen);

    /* ── Wischen (nur im statischen Zustand) ──────────────────────────
       Übernommen aus dem Original-Skript samt dessen Schwelle (25px) und
       Sperrzeit (280ms). Wichtig: an den Enden wird NICHT abgefangen,
       damit die Seite dort ganz normal weiterscrollt und man nicht
       festhängt.
       Bewusst OHNE den Mausrad-Teil des Vorbilds: dort ist Lenis auf
       Mobil abgeschaltet, das Rad also frei. Hier läuft dagegen immer der
       projekteigene Rad-Smooth-Scroll (createSmoothScroll oben) – ein
       zweiter Rad-Handler daneben würde bei schmalem Fenster doppelt
       wirken: Seite scrollt UND Kachel springt weiter. Zum Blättern
       bleiben Pfeile und Kategorienliste. */
    var WISCH_SCHWELLE = 25, SPERRE = 280;
    var gesperrt = false, wischStart = null;

    function weiter(richtung) {
      if (gesperrt) return false;
      var ziel = index + richtung;
      if (ziel < 0 || ziel > gesamt - 1) return false;
      setzen(ziel);
      gesperrt = true;
      window.setTimeout(function () { gesperrt = false; }, SPERRE);
      return true;
    }

    if (listeEl) {
      listeEl.addEventListener('touchstart', function (e) {
        wischStart = e.touches && e.touches[0] ? e.touches[0].clientY : null;
      }, { passive: true });

      listeEl.addEventListener('touchmove', function (e) {
        if (!istStatisch() || wischStart === null || gesperrt) return;
        var delta = e.touches[0].clientY - wischStart;
        if (Math.abs(delta) < WISCH_SCHWELLE) return;
        if (weiter(delta < 0 ? 1 : -1)) e.preventDefault();
        wischStart = null;
      }, { passive: false });

      listeEl.addEventListener('touchend', function () { wischStart = null; }, { passive: true });
    }

    setzen(0);
    if (!istStatisch()) pruefen();
  })();

  /* ── Spezialitäten-Karussell ───────────────────────────────────────
     Wie jeder andere Abschnitt in eine eigene IIFE gefasst. Vorher lief
     dieser Block auf oberster Ebene und stieg mit „if (!deck) return;"
     aus der ÄUSSEREN Funktion aus – auf jeder Seite ohne Karussell war
     damit alles, was danach kam, unerreichbar. Der Block musste deshalb
     zwingend als letzter stehen; diese stille Reihenfolge-Abhängigkeit
     ist mit der eigenen Kapselung weg.                                  */
  (function () {
  var deck = document.querySelector('[data-deck]');
  if (!deck) return;

  var section = document.getElementById('spezialitaeten');
  var originals = alleEl('[data-card]', deck);
  var unique = originals.length;

  /* Für den Ringlauf brauchen wir genug Karten, um alle Plätze von -3 bis +4
     gleichzeitig zu besetzen. Bei vier Spezialitäten wird der Satz verdoppelt. */
  var SLOTS = 8;
  if (unique < SLOTS) {
    var copies = Math.ceil(SLOTS / unique);
    for (var c = 1; c < copies; c++) {
      originals.forEach(function (card) {
        deck.appendChild(card.cloneNode(true));
      });
    }
  }

  var cards = alleEl('[data-card]', deck);
  var total = cards.length;
  var half = Math.floor(total / 2);

  var slots = {
    name: section.querySelector('[data-slot="name"]'),
    sub: section.querySelector('[data-slot="sub"]'),
    text: section.querySelector('[data-slot="text"]'),
    index: section.querySelector('[data-slot="index"]'),
    total: section.querySelector('[data-slot="total"]')
  };
  var arrows = alleEl('.arrow', section);
  var active = 0;

  /* Bilder erst einblenden, wenn sie geladen sind */
  cards.forEach(function (card) {
    var img = card.querySelector('.deck__media');
    if (!img) { card.classList.add('is-ready'); return; }
    if (img.complete && img.naturalWidth) card.classList.add('is-ready');
    else img.addEventListener('load', function () { card.classList.add('is-ready'); }, { once: true });
    img.addEventListener('error', function () { card.classList.add('is-ready'); }, { once: true });
  });

  deck.setAttribute('role', 'group');
  deck.setAttribute('aria-roledescription', T.karussell);
  deck.setAttribute('aria-label', T.spezialitaeten);
  deck.setAttribute('tabindex', '0');

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  /* Ringabstand von Karte i zur Position idx, vorzeichenbehaftet */
  function abstand(i, idx) {
    var rel = ((i - idx) % total + total) % total;
    return rel > half ? rel - total : rel;
  }

  /* Platzierung je Abstand – Werte 1:1 aus dem Slider des Vorbilds */
  function platz(diff) {
    var a = Math.abs(diff);
    if (a === 0) return { x: 0, y: 0, rot: 0, s: 1, o: 1 };
    var dir = diff > 0 ? 1 : -1;
    if (a === 1) return { x: 25 * dir, y: 1, rot: 10 * dir, s: 0.9, o: 1 };
    if (a === 2 && total >= 4) return { x: 45 * dir, y: 5, rot: 15 * dir, s: 0.8, o: 1 };
    return { x: 55 * dir, y: 5, rot: 20 * dir, s: 0.6, o: 0 };
  }

  function render(animateText) {
    cards.forEach(function (card, i) {
      /* Ringabstand: 0, ±1, ±2 sind sichtbar, ab ±3 geparkt */
      var offset = abstand(i, active);
      var before = Number(card.dataset.offset);

      /* Sprung von ganz links nach ganz rechts (und zurück) darf nicht
         animiert werden – sonst fliegt die Karte durchs Bild. */
      var jumps = Math.abs(before) >= 3 && Math.abs(offset) >= 3 &&
                  (before < 0) !== (offset < 0);
      if (jumps) {
        card.style.transition = 'none';
        card.dataset.offset = String(offset);
        void card.offsetWidth;               /* Umbruch erzwingen */
        card.style.transition = '';
      } else {
        card.dataset.offset = String(offset);
      }

      card.setAttribute('aria-hidden', offset === 0 ? 'false' : 'true');
    });

    /* Der Zähler springt sofort mit, wie im Vorbild */
    var data = cards[active].dataset;
    slots.index.textContent = pad((active % unique) + 1);
    slots.name.textContent = data.name;
    slots.sub.textContent = data.sub;
    slots.text.textContent = data.text;

    /* Kein Ausblenden – der neue Text läuft gestaffelt ein */
    if (animateText && !reduceMotion) {
      section.classList.remove('is-swapping');
      void section.offsetWidth;              /* Animation neu starten */
      section.classList.add('is-swapping');
    }
  }

  /* Endlos: um `delta` Plätze weiterdrehen */
  function step(delta) {
    if (!delta) return;
    active = ((active + delta) % total + total) % total;
    render(true);
    restartAuto();
  }

  /* Auf eine bestimmte Karte – immer über den kürzeren Weg */
  function goToCard(i) {
    var rel = ((i - active) % total + total) % total;
    step(rel > half ? rel - total : rel);
  }

  arrows.forEach(function (btn) {
    btn.addEventListener('click', function () { step(Number(btn.dataset.dir)); });
  });

  var draggedAt = 0;

  cards.forEach(function (card, i) {
    card.addEventListener('click', function () {
      if (Date.now() - draggedAt < 400) return;  /* war ein Wisch, kein Klick */
      goToCard(i);
    });
  });

  deck.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
  });

  /* ── Ziehen ─────────────────────────────────────────────────────────
     Wie im Vorbild: der Stapel folgt der Bewegung anteilig, entschieden
     wird erst beim Loslassen ab 10 % der Bühnenbreite. Der Zeiger wird
     eingefangen, sonst landet das pointerup außerhalb der Karte.        */
  var stage = section.querySelector('.spez__stage');
  var drag = null;
  var SCHWELLE = 0.1;

  function buehne() { return (stage && stage.offsetWidth) || deck.offsetWidth * 3; }

  function ziehen(fortschritt, richtung) {
    var ziel = ((active + richtung) % total + total) % total;
    cards.forEach(function (card, i) {
      var von = platz(abstand(i, active));
      var nach = platz(abstand(i, ziel));
      function misch(k) { return von[k] + (nach[k] - von[k]) * fortschritt; }
      card.style.transform =
        'translate(' + misch('x') + '%,' + misch('y') + '%) rotate(' +
        misch('rot') + 'deg) scale(' + misch('s') + ')';
      card.style.opacity = misch('o');
    });
  }

  function ziehenLoesen() {
    cards.forEach(function (card) {
      card.style.transform = '';
      card.style.opacity = '';
    });
  }

  deck.addEventListener('pointerdown', function (e) {
    if (e.button !== undefined && e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, id: e.pointerId, dx: 0, achse: null };
    stopAuto();
    if (deck.setPointerCapture) {
      try { deck.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
    }
  });

  deck.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.x;
    var dy = e.clientY - drag.y;

    if (!drag.achse) {                                  /* Richtung festlegen */
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      drag.achse = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (drag.achse === 'x') deck.classList.add('is-dragging');
    }
    if (drag.achse !== 'x') return;                     /* senkrecht: scrollen */

    drag.dx = dx;
    var fortschritt = Math.min(1, Math.abs(dx) / buehne());
    ziehen(fortschritt, dx < 0 ? 1 : -1);
  });

  function dragEnde(e) {
    if (!drag) return;
    var dx = drag.dx;
    var achse = drag.achse;
    drag = null;

    if (deck.releasePointerCapture && e && e.pointerId !== undefined) {
      try { deck.releasePointerCapture(e.pointerId); } catch (err) { /* egal */ }
    }
    /* Kein waagerechtes Ziehen (z. B. nur ein Klick ohne Bewegung, oder
       senkrechtes Scrollen) – trotzdem den Auto-Takt wieder anstoßen,
       sonst bliebe der Fächer nach einem bloßen Klick auf freie Fläche
       im Deck dauerhaft pausiert (pointerdown pausiert immer, s.o.). */
    if (achse !== 'x') { restartAuto(); return; }

    deck.classList.remove('is-dragging');   /* Übergänge wieder an … */
    ziehenLoesen();                         /* … dann die Steuerung ans CSS */

    if (Math.abs(dx) / buehne() > SCHWELLE) {
      draggedAt = Date.now();
      step(dx < 0 ? 1 : -1);       /* ruft restartAuto() bereits mit auf */
    } else {
      restartAuto();
    }
  }
  deck.addEventListener('pointerup', dragEnde);
  deck.addEventListener('pointercancel', dragEnde);
  deck.addEventListener('lostpointercapture', dragEnde);

  /* Bild-Ziehen des Browsers unterbinden */
  deck.addEventListener('dragstart', function (e) { e.preventDefault(); });

  /* ── Automatischer Weiterlauf ──────────────────────────────────────
     Der Fächer dreht sich von allein weiter, auch während man mit der
     Maus darüber steht (Kundenwunsch: Hover soll NICHT pausieren,
     sondern der Lauf soll einfach weitergehen – anfangs pausierte er bei
     Hover und startete beim Verlassen wieder bei null, was sich wie ein
     Neustart statt einer Bewegung anfühlte). Pausiert nur noch bei
     Tastaturfokus (damit Tastaturnutzer nicht von einem Sprung mitten in
     der Bedienung überrascht werden) und während des Ziehens (der
     Stapel wird dabei direkt per `ziehen()` transformiert – ein
     gleichzeitiger Auto-Schritt würde sich mit dieser Handsteuerung
     beißen). Respektiert weiterhin „reduzierte Bewegung". setInterval
     genügt hier (anders als beim Sonderwünsche-Textband) – es wird nur
     alle paar Sekunden EINMAL `step()` aufgerufen, keine Dauerbewegung
     pro Frame, die mit dem eigenen Smooth-Scroll um den Hauptthread
     konkurrieren könnte.                                                */
  var AUTO_MS = 3000;
  var autoTimer = null;
  var focusPause = false;
  var autobar = section.querySelector('[data-autobar]');

  function autoErlaubt() {
    return !reduceMotion && !focusPause && !drag;
  }
  /* Balken pausiert = leer statt mitten im Lauf eingefroren (Klasse weg,
     CSS-Grundzustand ist scaleX(0)) – so kann er nie einen Zeitpunkt
     versprechen, an dem in Wahrheit (noch) nicht weitergedreht wird. */
  function pauseBar() {
    if (autobar) autobar.classList.remove('is-filling');
  }
  /* Läuft immer exakt AUTO_MS, synchron zum gerade gestarteten Intervall –
     via Klasse entfernen/reflow-erzwingen/wieder hinzufügen neu gestartet,
     wie schon beim „.is-swapping"-Textwechsel weiter oben. */
  function fillBar() {
    if (!autobar) return;
    autobar.classList.remove('is-filling');
    autobar.style.animationDuration = AUTO_MS + 'ms';
    void autobar.offsetWidth;
    autobar.classList.add('is-filling');
  }
  function stopAuto() {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    pauseBar();
  }
  function startAuto() {
    stopAuto();
    if (autoErlaubt()) {
      autoTimer = window.setInterval(function () { step(1); }, AUTO_MS);
      fillBar();
    }
  }
  /* Nach jeder Drehung (ob automatisch oder manuell) den Takt neu starten,
     damit auf eine manuelle Aktion nicht sofort der nächste Auto-Schritt folgt. */
  function restartAuto() { startAuto(); }

  /* Nur bei ECHTEM Tastaturfokus pausieren (`:focus-visible`), nicht bei
     jedem Fokus. Grund: `deck` hat `tabindex="0"` fürs Tastatur-Wischen –
     auf echten Touch-Geräten setzen viele Browser beim Antippen/Wischen
     selbst den Fokus auf so ein Element, OHNE dass danach je ein „blur"
     folgt (anders als bei Hover gibt es nach einer Wischgeste kein
     natürliches Verlassen-Ereignis). Ohne diese Einschränkung blieb
     `focusPause` nach jeder Wischgeste auf einem Touchscreen für immer
     hängen und der Balken dauerhaft pausiert. `:focus-visible` ist genau
     dafür da: der Browser setzt es nur bei erkennbar tastaturbasiertem
     Fokus (z. B. Tab), nicht bei Zeiger-/Touch-Interaktion. */
  deck.addEventListener('focusin', function () {
    if (deck.matches(':focus-visible')) { focusPause = true; startAuto(); }
  });
  deck.addEventListener('focusout', function () { focusPause = false; startAuto(); });

  /* ── Einmaliges Anblättern direkt nach der Auffächer-Animation ────────
     Kundenwunsch: sobald der Nutzer heruntergescrollt hat und die Karten
     fertig aufgefächert sind (.spez__stage bekommt .is-in, siehe das
     generische .reveal-System weiter oben in dieser Datei), soll der
     Fächer einmal sofort weiterblättern – ein kleiner Hinweis "das
     bewegt sich", statt bis zu AUTO_MS auf den ersten regulären
     Auto-Schritt zu warten. Ein MutationObserver statt eines eigenen
     IntersectionObservers, weil .is-in ohnehin schon vom generischen
     .reveal-System gesetzt wird – hier wird nur abgewartet, bis genau
     DAS passiert, statt die Sichtbarkeitslogik ein zweites Mal zu bauen.
     Respektiert „reduzierte Bewegung" wie der Rest des Auto-Laufs. */
  if (stage && !reduceMotion) {
    var geblaettert = false;
    var revealBeob = null;
    function einmalBlaettern() {
      if (geblaettert) return;
      geblaettert = true;
      if (revealBeob) revealBeob.disconnect();
      /* Den seit dem Laden schon laufenden Hintergrund-Takt sofort
         anhalten: er tickt unabhängig von der Sichtbarkeit weiter, sein
         nächster Schritt könnte sonst rein zufällig fast genau in dieses
         700ms-Fenster fallen und zusammen mit dem gezielten Blättern
         unten zu ZWEI sichtbaren Schritten statt einem führen (genau so
         beobachtet beim ersten Verifikationslauf). step() unten startet
         den Takt am Ende ohnehin frisch neu (restartAuto()). */
      stopAuto();
      /* Die Elastic-Transition der Karten dauert 0.6s (siehe .deck__card
         in styles.css) – etwas Puffer, damit das Blättern erst startet,
         wenn das Auffächern wirklich zur Ruhe gekommen ist. */
      window.setTimeout(function () { step(1); }, 700);
    }
    if (stage.classList.contains('is-in')) {
      einmalBlaettern();
    } else {
      revealBeob = new MutationObserver(function () {
        if (stage.classList.contains('is-in')) einmalBlaettern();
      });
      revealBeob.observe(stage, { attributes: true, attributeFilter: ['class'] });
    }
  }

  slots.total.textContent = pad(unique);
  render(false);
  startAuto();
  })();
})();
