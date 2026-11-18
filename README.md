# Padel Americano

Mobile Web-App (PWA) für Padel-Americano-Abende mit 4–12 Spielern auf 1–3 Plätzen und 60–240 Minuten. Sie läuft komplett auf einem Handy, ohne Backend und ohne Accounts, und funktioniert offline.

**Zwei Spielmodi:** Zeit-Modus (feste Gesamtdauer, Runden mit Countdown) und klassischer Americano (jedes Match bis zu einer festen Punktzahl). Details unten.

**Funktionen:** Spielplan mit gleichmäßigen Aussetzern und Partner-Rotation, Countdown für Einspielen, Runden und Wechsel (mit Ton, Vibration und Wake Lock), Ergebniseingabe mit großen +/−-Buttons, Normierung auf eine feste Punktsumme, Live-Tabelle nach Ø Punkten, Korrektur und Rückgängig, Neuplanung bei Ausfall oder Nachzügler, Endstand mit Siegerpodest.

## Spielmodi

Der Modus wird vor dem Start im Setup gewählt und gilt für das ganze Turnier. In der Kopfzeile steht, welcher Modus und welches Punktziel gilt.

### Zeit-Modus (Standard)

Ihr legt die Gesamtdauer fest (60–240 Min.), und die App teilt sie in Runden mit Countdown auf. Gezählt wird jeder Ballwechsel. Am Ende jedes Matches rechnet die App das Ergebnis auf eine feste Punktsumme um (Standard 24), damit lange und kurze Matches vergleichbar sind.

### Klassischer Americano

Jedes Match geht bis zu einer festen Gesamtpunktzahl **S** (16, 21, 24 oder 32, Standard 24), z. B. 15:9 oder 12:12. Jeder Spieler bekommt die Punkte seines Teams. Es gibt keine Gesamtdauer und keine Umrechnung.

- **Ergebnis:** Du gibst die Punkte eines Teams ein, das andere wird automatisch S minus diesem Wert. Eine andere Summe ist nicht möglich.
- **Ablauf:** Das Einspielen läuft als Countdown. Danach zeigt jede Runde eine Uhr, die hochzählt (wie lange die Runde schon läuft). Eine Runde endet, sobald für alle Plätze ein Ergebnis eingetragen ist. Dann startet automatisch die Wechselzeit. Bei mehreren Plätzen steht an jedem Platz „läuft“ oder „✓ fertig“.
- **Aufschlag:** Die App zeigt einen Aufschlagwechsel alle S ÷ 8 Punkte (16 → 2, 24 → 3, 32 → 4), dann schlägt jeder genau zweimal auf. Bei 21 sind es alle 3 Punkte, dann schlägt einer einmal weniger auf.
- **Tabelle:** Sortiert wird nach Ø Punkten pro Match. Haben alle gleich viele Matches, ist das dieselbe Reihenfolge wie nach Gesamtpunkten. Nach Ausfällen oder mit Nachzüglern ist der Ø fairer. Die Spalte „Punkte“ zeigt die echten Gesamtpunkte.

**Rundenzahl.** Vorgeschlagen wird die „volle Rotation“, damit jeder einmal mit jedem zusammenspielt. Dafür braucht es Spieler × (Spieler − 1) ÷ (4 × Plätze) Runden. Ohne Aussetzer ist das Spielerzahl − 1. Mit −/+ lässt sich die Zahl anpassen, z. B. wenn die Platzbuchung kürzer ist.

| Rotation | Fälle |
|---|---|
| **perfekt, jeder 1× mit und 2× gegen jeden** („Whist“) | 4 Spieler/1 Platz (3 Runden), 8 Spieler/2 Plätze (7), 12 Spieler/3 Plätze (11). Feste Konstruktion, gilt bei jeder Mischung. |
| **volle Partner-Rotation mit Aussetzern** | 5 Spieler/1 Platz (5 Runden), 9 Spieler/2 Plätze (9). Gegner sind dabei nicht ganz gleich verteilt. |
| **nicht perfekt möglich** | z. B. 6, 7, 10, 11 Spieler. Der Vorschlag ist die nächstgelegene Rundenzahl, bei der alle gleich oft spielen. Ein Hinweis zeigt, dass nicht jeder mit jedem spielt. |
| **gekürzt** | Würde die volle Rotation länger als ca. 3 Stunden dauern (z. B. 8 Spieler/1 Platz: 14 Runden, 12 Spieler/1 Platz: 33 Runden), schlägt die App die längste faire Rundenzahl darunter vor und sagt das. |

**Dauer – nur eine Schätzung.** Matchdauer ≈ 3,5 Min. + 0,31 Min. pro Punkt (16 → 8,5 · 21 → 10 · 24 → 11 · 32 → 13,5 Min.). Abgeleitet ist das aus den Richtwerten „24 Punkte ≈ 10–12 Min., 32 Punkte ≈ 12–15 Min.“. Gesamt ≈ Einspielen + Runden × Matchdauer + Wechselzeiten, gerundet auf 5 Minuten. Beispiel: 8 Spieler, 2 Plätze, 24 Punkte → 7 Runden · ca. 1:35 h. Wie lange ein Match wirklich dauert, hängt vom Niveau ab. Bei mehreren Plätzen bestimmt das langsamste Match die Runde.

Neuplanung bei Ausfall oder Nachzügler, Rückgängig, Pausenverteilung und Wake Lock funktionieren in beiden Modi gleich.

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
  classic.ts      klassischer Modus: Rundenzahl, Dauer-Schätzung, Aufschlag
  timer.ts        Timer als Zustandsmaschine (Countdown bzw. hochzählende Runde)
  tournament.ts   Turnierzustand: Ergebnisse, Rückgängig, Ausfall/Nachzügler
src/components/   React-Oberfläche
```

### Pausen zeitlich gleichmäßig verteilt

Jeder Spieler hat nicht nur gleich viele Pausen, sie liegen auch möglichst gleichmäßig über den Abend verteilt. Der Idealabstand ist Runden ÷ Pausen. Bei 10 Runden und 2 Pausen pausiert jemand also z. B. in Runde 3 und 8, nicht in Runde 1 und 3.

Die Planung bewertet dazu jede Abweichung vom Idealabstand mit Strafpunkten, im Quadrat: Große Häufungen sind teuer, kleine Rundungsunterschiede billig. Die Reihenfolge der Ziele:
1. gleiche Match- und Pausenzahl,
2. keine zwei Pausen hintereinander, wo vermeidbar,
3. gleichmäßige Abstände,
4. Partner-Rotation,
5. Gegner-Rotation.

Bei einer Neuplanung (Ausfall oder Nachzügler) zählen die Pausen vor dem Neuplanungszeitpunkt mit. Wer gerade pausiert hat, pausiert nicht direkt danach, und die nächste Pause kommt im passenden Abstand. Das Gewicht steht als `spacing` in `src/logic/schedule.ts`.

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
