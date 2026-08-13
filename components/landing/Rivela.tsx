"use client";

import { useEffect, useRef, useState } from "react";

// Comparsa allo scorrimento. Un observer solo per elemento e si stacca appena
// ha fatto il suo: tenerlo acceso vorrebbe dire far lavorare la pagina per
// un'animazione gia' avvenuta.
//
// L'elemento occupa il suo posto da subito e cambia solo opacita' e
// spostamento: cosi' non c'e' nessun salto di layout mentre si scorre.
export default function Rivela({
  children,
  ritardo = 0,
  className,
}: {
  children: React.ReactNode;
  ritardo?: number;
  className?: string;
}) {
  const rif = useRef<HTMLDivElement>(null);
  const [dentro, setDentro] = useState(false);

  useEffect(() => {
    const el = rif.current;
    if (!el) return;

    // Senza IntersectionObserver, o con il movimento ridotto, si mostra e
    // basta: meglio niente animazione che niente contenuto.
    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setDentro(true);
      return;
    }

    const obs = new IntersectionObserver(
      ([voce]) => {
        if (voce.isIntersecting) {
          setDentro(true);
          obs.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={rif}
      className={"lp-rivela " + (dentro ? "dentro " : "") + (className ?? "")}
      style={{ ["--ritardo" as string]: `${ritardo}ms` }}
    >
      {children}
    </div>
  );
}
