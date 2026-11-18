/**
 * App-Höhe für den äußeren Rahmen (.shell) als CSS-Variable --app-h.
 *
 * WARUM: In einer iPhone-App vom Home-Bildschirm mit
 * `apple-mobile-web-app-status-bar-style: black-translucent` zeichnet iOS die Seite
 * ab der Bildschirm-Oberkante (unter der Statusleiste), meldet für 100vh / 100dvh /
 * height:100% / innerHeight aber die Höhe OHNE Statusleiste. Ein Rahmen mit
 * 100dvh ist dann um genau die Statusleiste (~59 pt) zu kurz, und unter der
 * unteren Leiste bleibt ein Streifen frei.
 *
 * Lösung: Läuft die App auf dem iPhone im Vollbild (Home-Bildschirm, Hochformat),
 * ist die echte App-Höhe die Bildschirmhöhe (screen.height). Sonst (Browser,
 * Android, Desktop, Querformat) bleibt es bei innerHeight. Behebt Apple das
 * Verhalten, sind beide Werte gleich und es ändert sich nichts.
 *
 * Bitte nicht durch 100vh/100dvh ersetzen – genau das war der Fehler.
 */
export function initAppHeight(): void {
  const root = document.documentElement;
  const update = () => {
    let h = window.innerHeight;
    const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const portrait = window.innerHeight >= window.innerWidth;
    const fullWidth = Math.abs(window.screen.width - window.innerWidth) <= 1;
    if (iosStandalone && portrait && fullWidth) h = Math.max(h, window.screen.height);
    root.style.setProperty('--app-h', `${h}px`);
  };
  update();
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', () => setTimeout(update, 300));
  document.addEventListener('visibilitychange', update);
}
