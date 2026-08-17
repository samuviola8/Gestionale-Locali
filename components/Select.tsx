"use client";

import { useEffect, useRef, useState } from "react";

export type Option = { value: string; label: string };

export default function Select({
  options,
  name,
  value,
  defaultValue,
  onChange,
  size = "md",
  placeholder,
  className,
  ariaLabel,
  submitOnChange = false,
}: {
  options: Option[];
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  size?: "md" | "sm";
  placeholder?: string;
  className?: string;
  // Serve dove la tendina non ha un'etichetta accanto e da sola non si
  // capisce: due tendine in fila dicono "12" e "30" e basta.
  ariaLabel?: string;
  // Manda il form appena si sceglie: su un elenco di assegnazioni un pulsante
  // "salva" per riga sarebbe un clic in piu' per ognuna.
  submitOnChange?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [internal, setInternal] = useState(
    defaultValue ?? options[0]?.value ?? ""
  );
  const selected = value ?? internal;
  const ref = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLUListElement>(null);

  // Aprendo, la voce scelta si mette al centro. Su un elenco corto non cambia
  // niente; su uno lungo — gli orari della giornata — e' la differenza tra
  // scegliere le 20:00 e scorrere fino alle 20:00 partendo da mezzanotte.
  // Si sposta solo la lista, non la pagina: `scrollIntoView` porterebbe con se'
  // anche lo scorrimento di quello che ci sta dietro.
  useEffect(() => {
    if (!open) return;
    const el = lista.current?.querySelector<HTMLElement>('[data-scelta="1"]');
    if (!el || !lista.current) return;
    const voce = el.getBoundingClientRect();
    const box = lista.current.getBoundingClientRect();
    lista.current.scrollTop += voce.top - box.top - (box.height - voce.height) / 2;
  }, [open]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(v: string) {
    setInternal(v);
    onChange?.(v);
    setOpen(false);
    if (submitOnChange) {
      // Il campo nascosto si aggiorna al render successivo: si manda dopo,
      // altrimenti partirebbe col valore vecchio.
      requestAnimationFrame(() => ref.current?.closest("form")?.requestSubmit());
    }
  }

  const current = options.find((o) => o.value === selected);
  const pad = size === "sm" ? "px-3 py-1.5 text-xs" : "px-3.5 py-2 text-sm";

  return (
    <div ref={ref} className={"relative " + (className ?? "")}>
      {name && <input type="hidden" name={name} value={selected} />}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={"flex w-full items-center justify-between gap-2 rounded-xl border bd " + pad}
        style={{ background: "var(--surface)", color: "var(--text)" }}
      >
        <span className="truncate">{current?.label ?? placeholder ?? ""}</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#9aa0a0"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            flex: "none",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform .15s",
          }}
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-1.5 overflow-hidden rounded-xl border bd shadow-lg"
          style={{ background: "var(--surface)" }}
        >
          <ul ref={lista} className="max-h-60 overflow-auto p-1">
            {options.map((o) => {
              const isSel = o.value === selected;
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    data-scelta={isSel ? "1" : undefined}
                    onClick={() => pick(o.value)}
                    className="opt flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm"
                    style={
                      isSel
                        ? {
                            background: "var(--brand-50)",
                            color: "var(--brand-text)",
                          }
                        : undefined
                    }
                  >
                    <span className="truncate">{o.label}</span>
                    {isSel && (
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ flex: "none" }}
                        aria-hidden="true"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
