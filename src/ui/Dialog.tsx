/**
 * Native <dialog> als Modal (Plan 0003, E3): bleibt gemountet, `showModal()`/`close()` folgen `open`.
 * So gibt es Fokusfalle, inerten Hintergrund und Fokus-Rückgabe vom Browser. Esc/Android-Zurück
 * (`cancel`) und ein Tipp auf den Backdrop nehmen denselben Weg wie der Schließen-Knopf.
 */
import { type ReactNode, useEffect, useRef } from "react";
import { Toast } from "./Toast.tsx";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  label: string;
  className: string;
  /** Kurzmeldung: Der Seiten-Toast liegt hinter dem Modal und wäre unsichtbar und stumm. */
  toast: string;
  children: ReactNode;
}

export function Dialog({ open, onClose, label, className, toast, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Der Klick ist nur der Backdrop-Tipp; per Tastatur schließt Esc (cancel).
    <dialog
      ref={ref}
      aria-label={label}
      className={`dlg ${className}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // Nur echte Backdrop-Tipps: Ein Klick auf den Innenabstand trifft ebenfalls das dialog-Element.
        if (e.target !== e.currentTarget) return;
        const r = e.currentTarget.getBoundingClientRect();
        const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
        if (outside) onClose();
      }}
    >
      {open && (
        <>
          {children}
          <Toast message={toast} />
        </>
      )}
    </dialog>
  );
}
