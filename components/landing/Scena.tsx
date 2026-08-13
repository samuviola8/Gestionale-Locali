"use client";

import { useEffect, useRef } from "react";

// La scena del titolo: il telefono del cliente, la coda dello staff e il conto
// diviso, disposti in profondita' invece che affiancati. Sono le tre facce del
// prodotto e nella realta' succedono nello stesso momento.
//
// Non sono foto. Un mockup disegnato mostra il prodotto vero e non invecchia
// come uno screenshot, e non promette un locale che non esiste.
export default function Scena({ children }: { children: React.ReactNode }) {
  const scena = useRef<HTMLDivElement>(null);
  const palco = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const s = scena.current;
    const p = palco.current;
    if (!s || !p) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Sotto una certa larghezza la scena e' impilata: farla ruotare col dito
    // non ha senso e ruberebbe lo scorrimento.
    if (window.matchMedia("(max-width: 900px)").matches) return;

    let attesa = 0;
    function muovi(e: PointerEvent) {
      // Un frame solo per movimento: il puntatore ne manda molti di piu' di
      // quanti lo schermo ne possa disegnare.
      if (attesa) return;
      attesa = requestAnimationFrame(() => {
        attesa = 0;
        const r = s!.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        // Angoli piccoli: la scena deve seguire il puntatore, non inseguirlo.
        p!.style.setProperty("--ry", `${-11 + x * 9}deg`);
        p!.style.setProperty("--rx", `${7 - y * 7}deg`);
      });
    }

    function esci() {
      p!.style.setProperty("--ry", "-11deg");
      p!.style.setProperty("--rx", "7deg");
    }

    s.addEventListener("pointermove", muovi);
    s.addEventListener("pointerleave", esci);
    return () => {
      s.removeEventListener("pointermove", muovi);
      s.removeEventListener("pointerleave", esci);
      if (attesa) cancelAnimationFrame(attesa);
    };
  }, []);

  return (
    <div ref={scena} className="lp-scena" aria-hidden="true">
      <div ref={palco} className="lp-palco">
        {children}
      </div>
    </div>
  );
}
