/**
 * App-Höhe (--app-h) und iOS-Lücke (--ios-gap) als CSS-Variablen.
 *
 * WARUM: In einer iPhone-App vom Home-Bildschirm mit
 * `apple-mobile-web-app-status-bar-style: black-translucent` meldet iOS (beobachtet
 * auf iOS 26) die Höhe OHNE Statusleiste (innerHeight ≈ Bildschirm − 59 pt), zeichnet
 * die Seite aber ab der Bildschirm-Oberkante. Unter dieser gemeldeten Höhe bleibt
 * ein Streifen, in dem iOS KEINE Elemente zeichnet – nur die Hintergrundfarbe von
 * html/body.
 *
 * Erster Versuch (verworfen): den Rahmen auf screen.height strecken. Ergebnis: Der
 * untere Teil der Leiste lag im Streifen und wurde abgeschnitten (Tab-Beschriftungen
 * fehlten). Bitte nicht wieder einbauen.
 *
 * Jetzt:
 *  - --app-h = innerHeight: Der Rahmen ist genau so hoch, wie iOS zeichnet → alles sichtbar.
 *  - --ios-gap = Höhe des Streifens darunter (0, wenn es ihn nicht gibt). html/body haben
 *    die Leistenfarbe, der Streifen sieht also aus wie die Fortsetzung der Leiste. Er
 *    deckt die Home-Indicator-Linie ab, deshalb zieht die Leiste ihn von ihrem
 *    safe-area-Abstand unten ab (siehe .shell-footer in styles.css).
 * Behebt Apple das Verhalten, ist --ios-gap 0 und alles ist wie in jedem Browser.
 */
export function initAppHeight(): void {
  const root = document.documentElement;
  const update = () => {
    const h = window.innerHeight;
    const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const portrait = h >= window.innerWidth;
    const fullWidth = Math.abs(window.screen.width - window.innerWidth) <= 1;
    const gap = iosStandalone && portrait && fullWidth ? Math.max(0, window.screen.height - h) : 0;
    root.style.setProperty('--app-h', `${h}px`);
    root.style.setProperty('--ios-gap', `${gap}px`);
  };
  update();
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', () => setTimeout(update, 300));
  document.addEventListener('visibilitychange', update);
}
