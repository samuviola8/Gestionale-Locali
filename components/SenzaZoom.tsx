"use client";

import { useEffect } from "react";

// Niente zoom sulla pagina del tavolo.
//
// Il menu e' gia' scritto per lo schermo del telefono: ingrandirlo non fa
// vedere niente di piu'. In compenso la pizzicata parte da sola mentre si
// scorre con due dita, e chi ordina si ritrova la pagina storta e mezza fuori
// schermo — col carrello che sbuca da un angolo e nessun modo ovvio di
// rimettere le cose a posto. Al tavolo, con la fila al bancone, quello e' il
// momento in cui si chiama il cameriere e si ordina a voce.
//
// Il meta viewport da solo non basta: Safari su iPhone ignora
// "user-scalable=no" da iOS 10 in poi. Gli eventi "gesture*" sono la sua
// strada, e il touchmove a due dita copre i browser che non li hanno.
export default function SenzaZoom() {
  useEffect(() => {
    function blocca(e: Event) {
      e.preventDefault();
    }
    function bloccaDueDita(e: TouchEvent) {
      // Un dito solo e' uno scorrimento normale e deve restare tale: qui si
      // toglie lo zoom, non la possibilita' di leggere il menu.
      if (e.touches.length > 1) e.preventDefault();
    }

    // passive: false, altrimenti il browser si tiene il diritto di ignorare il
    // preventDefault e la pizzicata passa lo stesso.
    const opzioni: AddEventListenerOptions = { passive: false };
    document.addEventListener("gesturestart", blocca, opzioni);
    document.addEventListener("gesturechange", blocca, opzioni);
    document.addEventListener("gestureend", blocca, opzioni);
    document.addEventListener("touchmove", bloccaDueDita, opzioni);

    return () => {
      document.removeEventListener("gesturestart", blocca, opzioni);
      document.removeEventListener("gesturechange", blocca, opzioni);
      document.removeEventListener("gestureend", blocca, opzioni);
      document.removeEventListener("touchmove", bloccaDueDita, opzioni);
    };
  }, []);

  return null;
}
