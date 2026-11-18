import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  header: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** Bei Änderung springt der Scrollbereich nach oben (z. B. Tab-Wechsel). */
  scrollKey?: string;
  className?: string;
}

/**
 * App-Rahmen für iOS-PWAs: Das Dokument selbst scrollt nie.
 * Kopfzeile und Fußleiste sind feste Flex-Bereiche, nur <main> dazwischen scrollt.
 * So kann iOS beim Überscrollen (Bounce) weder Kopf noch Leiste verschieben.
 */
export function Layout({ header, footer, children, scrollKey, className = '' }: Props) {
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [scrollKey]);

  return (
    <div className={`shell ${className}`}>
      <header className="shell-header">
        <div className="shell-inner">{header}</div>
      </header>
      <main ref={mainRef} className="shell-main">
        <div className="shell-inner">{children}</div>
      </main>
      {footer && <footer className="shell-footer">{footer}</footer>}
    </div>
  );
}
