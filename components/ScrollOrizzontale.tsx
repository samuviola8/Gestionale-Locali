"use client";

import { useEffect } from "react";

// Col mouse una striscia orizzontale non si scorre: la rotella fa scorrere la
// pagina e le categorie restano ferme. Qui la rotella verticale diventa
// scorrimento laterale quando il cursore e' sopra una striscia.
//
// Il riconoscimento non passa da una classe ma dal comportamento: si cerca il
// primo antenato che scorre davvero in orizzontale. Cosi' vale per le pillole
// della cassa, per quelle del menu, per le skin dei locali e per qualunque
// striscia aggiunta dopo, senza doversi ricordare di segnarla.
function scorritoreOrizzontale(da: Element | null): HTMLElement | null {
  let el: Element | null = da;
  while (el && el !== document.body) {
    if (el instanceof HTMLElement && el.scrollWidth > el.clientWidth + 1) {
      const overflow = getComputedStyle(el).overflowX;
      if (overflow === "auto" || overflow === "scroll") return el;
    }
    el = el.parentElement;
  }
  return null;
}

export default function ScrollOrizzontale() {
  useEffect(() => {
    function onWheel(e: WheelEvent) {
      // Pinch per lo zoom, non scorrimento.
      if (e.ctrlKey) return;
      // Il trackpad manda gia' il movimento laterale suo: non va raddoppiato.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;

      const striscia = scorritoreOrizzontale(e.target as Element | null);
      if (!striscia) return;

      // Alcuni browser contano in righe invece che in pixel.
      const passo = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const massimo = striscia.scrollWidth - striscia.clientWidth;

      // Arrivati in fondo si lascia scorrere la pagina: intercettare sempre
      // vorrebbe dire intrappolare la rotella sopra la striscia.
      const inTesta = passo < 0 && striscia.scrollLeft <= 0;
      const inCoda = passo > 0 && striscia.scrollLeft >= massimo - 1;
      if (inTesta || inCoda) return;

      e.preventDefault();
      striscia.scrollLeft = Math.max(
        0,
        Math.min(massimo, striscia.scrollLeft + passo)
      );
    }

    // passive: false, altrimenti preventDefault non ha effetto e la pagina
    // scorre lo stesso.
    document.addEventListener("wheel", onWheel, { passive: false });
    return () => document.removeEventListener("wheel", onWheel);
  }, []);

  return null;
}
