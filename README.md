# Padel Americano

Mobile Web-App (PWA) für Padel-Americano-Abende mit 4–12 Spielern auf 1–3 Plätzen und 60–240 Minuten. Sie läuft komplett auf einem Handy, ohne Backend und ohne Accounts, und funktioniert offline.

**Funktionen:** Spielplan mit gleichmäßigen Aussetzern und Partner-Rotation, Countdown für Einspielen, Runden und Wechsel (mit Ton, Vibration und Wake Lock), Ergebniseingabe mit großen +/−-Buttons, Normierung auf eine feste Punktsumme, Live-Tabelle nach Ø Punkten, Korrektur und Rückgängig, Neuplanung bei Ausfall oder Nachzügler, Endstand mit Siegerpodest.

## Lokal starten

Voraussetzung: [Node.js](https://nodejs.org) ab Version 22.

```bash
npm install
npm run dev        # Entwicklungsserver, http://localhost:5173
npm test           # alle Logik-Tests (Vitest)
npm run build      # Produktions-Build nach dist/
npm run preview    # Build lokal ansehen
npm run report     # Runden-Tabelle für alle Spieler/Platz/Dauer-Kombinationen
```

## Kostenlos veröffentlichen (GitHub Pages)

Die App ist eine rein statische Seite und wird über GitHub Pages gehostet.

### Einrichtung

1. Lege auf [github.com](https://github.com) ein neues Repository an (z. B. `padel-americano`). Wähle **Public**: GitHub Pages ist im Gratis-Konto nur für öffentliche Repos verfügbar.
2. Lade den Projektordner hoch (ohne `node_modules` und `dist`):
   ```bash
   git init
   git add .
   git commit -m "Padel Americano"
   git branch -M main
   git remote add origin https://github.com/<dein-name>/padel-americano.git
   git push -u origin main
   ```
3. Im Repository auf GitHub: **Settings → Pages → Build and deployment → Source: „GitHub Actions“** auswählen.
4. Der Workflow `.github/workflows/deploy.yml` läuft automatisch bei jedem Push. Er testet, baut und veröffentlicht die App. Den Fortschritt siehst du unter **Actions**.
5. Danach ist die App erreichbar unter `https://<dein-name>.github.io/padel-americano/`.

### Änderungen veröffentlichen

Nach jeder Änderung im Projektordner:

```bash
git add .
git commit -m "Kurze Beschreibung der Änderung"
git push
```

Der Workflow testet, baut und veröffentlicht die neue Version automatisch.

## Auf dem Handy installieren

1. Öffne die URL auf dem Handy des Turnierleiters.
2. **iPhone (Safari):** Teilen-Symbol → **„Zum Home-Bildschirm“**.
   **Android (Chrome):** Menü ⋮ → **„App installieren“** bzw. **„Zum Startbildschirm hinzufügen“**.
3. Öffne die App einmal mit Internet. Danach funktioniert sie auch offline.

Tipps für den Abend:
- Tippe einmal auf **Start**, damit der Browser Töne abspielen darf. Das Display bleibt an, solange der Timer läuft (Wake Lock).
- Der komplette Stand liegt im Speicher des Browsers (localStorage). Neu laden oder Sperren schadet nicht. Wenn du die Browserdaten löschst, ist das Turnier aber weg.
- Ein Update der App wird beim nächsten Öffnen automatisch geladen.

## Aufbau

```
src/logic/        reine, UI-unabhängige Logik (mit Tests)
  rounds.ts       Zeit- und Rundenberechnung
  schedule.ts     Spielplan (Simulated Annealing + Konstruktion für 8/2 und 12/3), Neuplanung
  scoring.ts      Normierung auf die Punktsumme
  standings.ts    Tabelle inkl. Tiebreaker
  timer.ts        Timer als Zustandsmaschine
  tournament.ts   Turnierzustand: Ergebnisse, Rückgängig, Ausfall/Nachzügler
src/components/   React-Oberfläche
```

### Wo es keine perfekt faire Lösung gibt

Alle Zahlen gelten für die Standardwerte (5 Min. Einspielen, 2 Min. Wechsel). `npm run report` gibt die komplette Tabelle für alle 4–12 Spieler, 1–3 Plätze und 60–240 Min. aus.

**Ungleiche Match-Zahl (höchstens 1 Match Unterschied).** Das Setup zeigt dann einen Hinweis, und die Tabelle wertet nach Ø Punkten.

- **7 Spieler, 60 Min.:** Fair wären nur Vielfache von 7 Runden, die wären aber zu kurz. 6 Spieler spielen 3 Matches, einer 2.
- **9 Spieler, 60 und 90 Min.:** Fair wären nur 9 Runden. Die passen erst ab 120 Min. in den 8–20-Minuten-Rahmen. Bei 90 Min. auf 2 Plätzen spielt einer 8 Matches, die anderen 7.
- **11 Spieler, 60 und 90 Min.:** Fair wären nur 11 Runden, die erst ab 120 Min. passen. Bei 90 Min. auf 2 Plätzen spielt einer 6 Matches, die anderen 5.

**Viele Aussetzer auf 1 Platz (9–12 Spieler).** Setzt pro Runde mehr als die Hälfte aus, sitzen in zwei aufeinanderfolgenden Runden zwangsläufig dieselben Leute draußen. Bei 9 Spielern mindestens 1 Person pro Rundenwechsel, bei 10 Spielern 2, bei 11 Spielern 3, bei 12 Spielern 4. Die Pausen sind trotzdem gleich verteilt, und Partner wiederholen sich kaum. Pro Abend gibt es aber wenige Matches, z. B. 12 Spieler, 1 Platz, 120 Min.: 3 Matches pro Person. Mit 2 oder 3 Plätzen tritt das nicht auf.

**8 Spieler auf 1 Platz.** Hier setzt genau die Hälfte aus. Wer nie zweimal hintereinander aussetzen soll, landet in zwei festen 4er-Gruppen, die nie gemischt werden. Die App nimmt deshalb ein paar Doppel-Aussetzer in Kauf: 2 bei 90 und 120 Min., 5 ab 150 Min. Dafür hat jeder 4, 5 bzw. alle 7 möglichen Partner. Das Gewicht `consecutive` in `src/logic/schedule.ts` steuert diesen Kompromiss.

**Wenig Matches bei kurzer Dauer.** Bei 6 Spielern in 60 Min. sind es nur 3 Runden à 17 Min. (2 Matches pro Person). Mehr Runden würden unter 8 Min. fallen.

**Perfekt rotiert.** 8 Spieler auf 2 Plätzen (7 Runden) und 12 Spieler auf 3 Plätzen (11 Runden) laufen über eine feste Konstruktion: Jeder spielt mit jedem genau einmal zusammen und gegen jeden genau zweimal. Bei 240 Min. (22 Runden) mit 12 Spielern ist jeder genau zweimal Partner.
