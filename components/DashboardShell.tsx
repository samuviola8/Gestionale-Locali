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

  // Girando il tablet in orizzontale si torna alla barra fissa: il pannello
  // sparisce da solo, e con lui il blocco dello scorrimento — altrimenti
  // resterebbe una pagina ferma senza piu' niente da chiudere.
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const cambio = (e: MediaQueryListEvent) => {
      if (e.matches) setAperta(false);
    };
    query.addEventListener("change", cambio);
    return () => query.removeEventListener("change", cambio);
  }, []);

  useEffect(() => {
    if (!aperta) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAperta(false);
    };
    document.addEventListener("keydown", onKey);

    // Col pannello aperto la pagina sotto sta ferma. Il solo
    // `overflow: hidden` basta col mouse ma non sul telefono: iPhone lo
    // ignora e il dito continua a trascinare la pagina dietro. Inchiodare il
    // body e ricordarsi a che altezza era e' l'unico modo che regge anche li'.
    const y = window.scrollY;
    const paginaDiPartenza = window.location.pathname;
    const body = document.body;
    const prima = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = `-${y}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      body.style.position = prima.position;
      body.style.top = prima.top;
      body.style.width = prima.width;
      body.style.overflow = prima.overflow;
      // Il body inchiodato ha perso la posizione: senza questo si riparte
      // dall'inizio della pagina ogni volta che si chiude il menu. Se pero'
      // si e' chiuso perche' si e' scelta un'altra voce, la pagina nuova deve
      // aprirsi dall'alto, non all'altezza di quella lasciata.
      if (window.location.pathname === paginaDiPartenza) window.scrollTo(0, y);
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
            // touch-none: sulla zona scura il dito non deve trascinare
            // niente, ne' la pagina sotto ne' il pannello.
            className="fixed inset-0 z-40 touch-none bg-black/50 lg:hidden"
          />
        )}

        <aside
          className={
            // overscroll-contain: arrivati in fondo alle voci, lo scorrimento
            // si ferma li' invece di passare alla pagina dietro.
            "fixed inset-y-0 left-0 z-50 flex h-screen w-[17rem] max-w-[85vw] shrink-0 flex-col overflow-y-auto overscroll-contain p-4 transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:w-60 lg:max-w-none lg:translate-x-0 lg:shadow-none " +
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
