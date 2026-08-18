"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { IconBurger, IconClose } from "@/components/icons";

// Sotto i 1024px la colonna di sinistra si sfila fuori schermo e torna solo
// quando la si chiama col bottone: su un telefono quei 240px fissi lasciavano
// alla pagina una striscia inutilizzabile. Da lg in su non cambia nulla, la
// barra resta dov'era.
export default function DashboardShell({
  barraLaterale,
  intestazione,
  children,
}: {
  barraLaterale: React.ReactNode;
  intestazione: React.ReactNode;
  children: React.ReactNode;
}) {
  const [aperta, setAperta] = useState(false);
  const path = usePathname();

  // Si naviga da una voce del menu: la pagina sotto e' gia' cambiata, tenere
  // aperto il pannello vorrebbe dire nasconderla.
  useEffect(() => {
    setAperta(false);
  }, [path]);

  useEffect(() => {
    if (!aperta) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAperta(false);
    };
    document.addEventListener("keydown", onKey);
    // Senza questo si scorre la pagina dietro il pannello aperto.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [aperta]);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <div className="mx-auto flex min-h-screen max-w-6xl">
        {aperta && (
          <button
            type="button"
            aria-label="Chiudi il menu"
            onClick={() => setAperta(false)}
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          />
        )}

        <aside
          className={
            "fixed inset-y-0 left-0 z-50 flex h-screen w-[17rem] max-w-[85vw] shrink-0 flex-col overflow-y-auto p-4 transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:w-60 lg:max-w-none lg:translate-x-0 lg:shadow-none " +
            (aperta ? "translate-x-0 shadow-2xl" : "-translate-x-full")
          }
          style={{
            background: "var(--surface)",
            borderRight: "1px solid var(--border)",
          }}
        >
          <button
            type="button"
            aria-label="Chiudi il menu"
            onClick={() => setAperta(false)}
            className="absolute right-3 top-3 rounded-lg p-1.5 hover:bg-[var(--surface-2)] lg:hidden"
            style={{ color: "var(--muted)" }}
          >
            <IconClose size={20} />
          </button>

          {barraLaterale}
        </aside>

        {/* min-w-0: senza, questo figlio flex non si restringe sotto la
            larghezza del proprio contenuto e la pagina scorre in orizzontale. */}
        <main className="min-w-0 flex-1" style={{ background: "var(--bg)" }}>
          <div
            className="sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-3 backdrop-blur sm:px-6"
            style={{
              borderBottom: "1px solid var(--border)",
              background: "color-mix(in srgb, var(--bg) 82%, transparent)",
            }}
          >
            <button
              type="button"
              aria-label="Apri il menu"
              aria-expanded={aperta}
              onClick={() => setAperta(true)}
              className="-ml-1 shrink-0 rounded-lg p-2 hover:bg-[var(--surface-2)] lg:hidden"
              style={{ color: "var(--muted)" }}
            >
              <IconBurger size={20} />
            </button>

            {intestazione}
          </div>
          <div className="p-4 sm:p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
