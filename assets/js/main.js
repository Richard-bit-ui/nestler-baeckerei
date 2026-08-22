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
     Das Mausrad setzt ein Ziel, die Seite zieht mit fester Rate nach.
     Touch, Tastatur und Scrollbalken bleiben unangetastet.              */
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
      /* bildratenunabhängig: bei 60 Hz entspricht das einem Lerp von 0,12 */
      current += diff * (1 - Math.pow(1 - 0.12, dt / 16.667));
      apply(current);
      window.requestAnimationFrame(tick);
    }

    function start() {
      if (running) return;
      running = true;
      last = 0;
      window.requestAnimationFrame(tick);
    }

    window.addEventListener('wheel', function (e) {
      if (e.ctrlKey || e.metaKey) return;                       /* Zoomen */
      if (e.target.closest && e.target.closest('[data-scroll-native]')) return;
      if (limit() <= 0) return;
      e.preventDefault();
      var d = e.deltaY;
      if (e.deltaMode === 1) d *= 16;                           /* Zeilen */
      else if (e.deltaMode === 2) d *= window.innerHeight;      /* Seiten */
      target = clamp(target + d);
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

  function toggleMobile(open) {
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Menü schließen' : 'Menü öffnen');
    document.body.style.overflow = open ? 'hidden' : '';
    nav.dataset.hidden = 'false';

    /* Wie im Vorbild: das Panel bleibt im DOM, nur ein Attribut kippt –
       die eigentliche Animation übernimmt vollständig das CSS. */
    if (open) {
      nav.dataset.theme = 'light';
      mobilmenue.setAttribute('data-open', '');
    } else {
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

    function jetztInBerlin() {
      var teile = berlin.formatToParts(new Date());
      var map = {};
      teile.forEach(function (t) { map[t.type] = t.value; });
      return { tag: TAGE[map.weekday], minute: parseInt(map.hour, 10) * 60 + parseInt(map.minute, 10) };
    }

    function aktualisieren(el, plan) {
      var status = el.querySelector('[data-status]');
      var text = el.querySelector('[data-status-text]');
      var jetzt = jetztInBerlin();
      var heute = plan[jetzt.tag] || [];

      /* Offen? In der heutigen Liste nach einem Zeitraum suchen, der
         die aktuelle Minute einschließt. Bewusst nur das kurze Wort
         ("Geöffnet"/"Geschlossen") statt Uhrzeit/Restdauer – die Zeiten
         stehen daneben ja schon in der Stundenliste im Popup. */
      for (var i = 0; i < heute.length; i++) {
        if (jetzt.minute >= heute[i][0] && jetzt.minute < heute[i][1]) {
          status.setAttribute('data-open', 'true');
          text.textContent = 'Geöffnet';
          return;
        }
      }

      status.setAttribute('data-open', 'false');
      text.textContent = 'Geschlossen';
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

      var karte = document.querySelector('.geismap') || marker[0].parentElement;
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

     NEU (1:1 aus dem Original-Script übernommen, siehe Projektnotizen):
     jeder Zeitstrahl-Punkt bekommt nicht mehr EINEN gemeinsamen
     Einblend-Trigger, sondern vier einzelne – Jahr bei 85% Bildschirm-
     breite, Titel bei 80%, Punkt bei 90%, Foto sofort bei Kanteneintritt
     (100%) – über eigene is-in-year/-title/-dot/-img-Klassen auf dem
     Punkt (siehe styles.css für Timing/Easing/Zielzustände je Teil).

     Bewusst NICHT auf Mobil oder bei reduzierter Bewegung: horizontales
     Scroll-Hijacking ist auf einem Touch-Screen kein Vergnügen, und wer
     keine Bewegung möchte, soll auch keine bekommen. In beiden Fällen
     setzt dieser Block nur [data-static] auf die Sektion (siehe CSS für
     den ruhigen Fließ-Fallback) und hängt gar keinen Scroll-Handler ein. */
  (function () {
    var story = document.getElementById('historie');
    if (!story) return;

    var schmal = !window.matchMedia('(min-width: 901px)').matches;
    if (reduceMotion || schmal) {
      story.setAttribute('data-static', '');
      return;
    }

    function clamp01(n) { return Math.max(0, Math.min(1, n)); }

    /* ── Horizontale Zeitleiste ── */
    var hz = story.querySelector('[data-storyhz]');
    var spacer, track, line, items, maxShift = 0;
    if (hz) {
      spacer = hz.querySelector('.storyhz__spacer');
      track = hz.querySelector('[data-storyhz-track]');
      line = hz.querySelector('[data-storyhz-line]');
      items = alleEl('[data-storyhz-item]', hz);

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
      var schwelleYear = breiteFenster * 0.85;
      var schwelleTitle = breiteFenster * 0.80;
      var schwelleDot = breiteFenster * 0.90;
      items.forEach(function (item) {
        var links = item.getBoundingClientRect().left;
        if (!item.classList.contains('is-in-img') && links < breiteFenster) item.classList.add('is-in-img');
        if (!item.classList.contains('is-in-dot') && links < schwelleDot) item.classList.add('is-in-dot');
        if (!item.classList.contains('is-in-year') && links < schwelleYear) item.classList.add('is-in-year');
        if (!item.classList.contains('is-in-title') && links < schwelleTitle) item.classList.add('is-in-title');
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
    var ansichtBtns = alleEl('[data-stcat-view]', stcat);
    var scrollSpalte = stcat.querySelector('.stcat__scroll');
    var aktuellEl = stcat.querySelector('[data-stcat-current]');
    var gesamtEl  = stcat.querySelector('[data-stcat-total]');
    var listeEl   = stcat.querySelector('[data-stcat-list]');
    var rasterEl  = stcat.querySelector('[data-stcat-grid]');

    var gesamt = slides.length;
    if (!gesamt) return;

    function zwei(n) { return (n < 10 ? '0' : '') + n; }
    if (gesamtEl) gesamtEl.textContent = zwei(gesamt);

    var index = -1;

    function setzen(i) {
      i = Math.max(0, Math.min(gesamt - 1, i));
      if (i === index) return;
      index = i;
      navs.forEach(function (el, n) { el.classList.toggle('is-active', n === i); });
      subs.forEach(function (el, n) { el.classList.toggle('is-active', n === i); });
      slides.forEach(function (el, n) { el.classList.toggle('is-active', n === i); });
      if (aktuellEl) aktuellEl.textContent = zwei(i + 1);
    }

    /* ── Listen-/Rasteransicht ── */
    ansichtBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var ziel = btn.getAttribute('data-stcat-view');
        stcat.setAttribute('data-view', ziel);
        ansichtBtns.forEach(function (b) {
          b.setAttribute('aria-pressed', b.getAttribute('data-stcat-view') === ziel ? 'true' : 'false');
        });
        if (ziel === 'grid') {
          if (rasterEl) rasterEl.hidden = false;
          if (listeEl) listeEl.hidden = true;
        } else {
          if (listeEl) listeEl.hidden = false;
          if (rasterEl) rasterEl.hidden = true;
        }
      });
    });

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
        springen(index + parseInt(btn.getAttribute('data-stcat-dir'), 10));
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
  deck.setAttribute('aria-roledescription', 'Karussell');
  deck.setAttribute('aria-label', 'Unsere Spezialitäten');
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
    if (achse !== 'x') return;

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
     Der Fächer dreht sich von allein weiter, solange niemand damit
     interagiert. Pausiert bei Hover/Tastaturfokus/Ziehen und respektiert
     „reduzierte Bewegung". setInterval genügt hier (anders als beim
     Sonderwünsche-Textband) – es wird nur alle paar Sekunden EINMAL
     `step()` aufgerufen, keine Dauerbewegung pro Frame, die mit dem
     eigenen Smooth-Scroll um den Hauptthread konkurrieren könnte.       */
  var AUTO_MS = 4200;
  var autoTimer = null;
  var hoverPause = false;
  var focusPause = false;

  function autoErlaubt() {
    return !reduceMotion && !hoverPause && !focusPause && !drag;
  }
  function stopAuto() {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  }
  function startAuto() {
    stopAuto();
    if (autoErlaubt()) autoTimer = window.setInterval(function () { step(1); }, AUTO_MS);
  }
  /* Nach jeder Drehung (ob automatisch oder manuell) den Takt neu starten,
     damit auf eine manuelle Aktion nicht sofort der nächste Auto-Schritt folgt. */
  function restartAuto() { startAuto(); }

  deck.addEventListener('pointerenter', function () { hoverPause = true; startAuto(); });
  deck.addEventListener('pointerleave', function () { hoverPause = false; startAuto(); });
  deck.addEventListener('focusin', function () { focusPause = true; startAuto(); });
  deck.addEventListener('focusout', function () { focusPause = false; startAuto(); });

  slots.total.textContent = pad(unique);
  render(false);
  startAuto();
  })();
})();
