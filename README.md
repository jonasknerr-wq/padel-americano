# Padel Americano

Mobile Web-App (PWA) für Padel-Americano-Abende mit 4–8 Spielern. Sie läuft komplett auf einem Handy, ohne Backend und ohne Accounts, und funktioniert offline.

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

## Kostenlos veröffentlichen

Die App ist eine rein statische Seite. Wähle **eine** der beiden Varianten.

### Variante A: GitHub Pages

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

### Variante B: Netlify

1. Auf [netlify.com](https://www.netlify.com) kostenlos anmelden.
2. **Add new site → Import an existing project** wählen und das GitHub-Repository verbinden. Build-Befehl und Ordner kommen automatisch aus `netlify.toml`.
   - Ohne GitHub geht es auch: lokal `npm run build` ausführen und den Ordner `dist` auf [app.netlify.com/drop](https://app.netlify.com/drop) ziehen.
3. Netlify zeigt dir die URL an (z. B. `https://padel-americano.netlify.app`). Unter *Site configuration* kannst du den Namen ändern.

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
  schedule.ts     Spielplan (Simulated Annealing + Konstruktion für 8 Spieler/2 Plätze), Neuplanung
  scoring.ts      Normierung auf die Punktsumme
  standings.ts    Tabelle inkl. Tiebreaker
  timer.ts        Timer als Zustandsmaschine
  tournament.ts   Turnierzustand: Ergebnisse, Rückgängig, Ausfall/Nachzügler
src/components/   React-Oberfläche
```

### Wo es keine perfekt faire Lösung gibt

- **7 Spieler, 60 Min.:** Eine faire Rundenzahl müsste ein Vielfaches von 7 sein, die Runden wären dann aber zu kurz. Deshalb spielen 6 Spieler 3 Matches und einer 2. Das Setup zeigt einen Hinweis an, und die Tabelle wertet nach Ø Punkten.
- **8 Spieler auf 1 Platz:** Wer nie zweimal hintereinander aussetzen soll, landet zwangsläufig in zwei festen 4er-Gruppen. Die App erlaubt deshalb höchstens 2 Doppel-Aussetzer, dafür hat jeder 4–5 verschiedene Partner. Das Gewicht `consecutive` in `src/logic/schedule.ts` steuert das.
- **Wenig Matches:** Bei 6 Spielern in 60 Min. sind es nur 3 Runden zu je 17 Min. (2 Matches pro Spieler). Mehr Runden würden unter 8 Min. fallen.
