import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

export interface ConfirmOptions {
  title: string;
  text?: ReactNode;
  confirm?: string;
  cancel?: string;
  danger?: boolean;
}

type Ask = (o: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<Ask>(async () => false);

export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const ask = useCallback<Ask>((o) => new Promise((resolve) => setPending({ ...o, resolve })), []);
  const close = (v: boolean) => {
    pending?.resolve(v);
    setPending(null);
  };
  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {pending && (
        <div className="overlay" onClick={() => close(false)}>
          <div className="dialog" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>{pending.title}</h2>
            {pending.text && <div className="dialog-text">{pending.text}</div>}
            <div className="dialog-actions">
              <button className="btn" onClick={() => close(false)}>
                {pending.cancel ?? 'Abbrechen'}
              </button>
              <button className={`btn ${pending.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)}>
                {pending.confirm ?? 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function Sheet({ children, onClose, label }: { children: ReactNode; onClose: () => void; label: string }) {
  return (
    <div className="overlay overlay-bottom" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
