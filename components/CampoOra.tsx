"use client";

import { useState } from "react";
import Select from "@/components/Select";

// Un orario si sceglie con lo stesso menu a tendina di tutto il resto.
//
// Il campo <input type="time"> del browser sembrava la scelta ovvia, ma il
// pannello che apre al clic e' finestra sua, non pagina nostra: non si veste
// col CSS, e sul tema scuro esce coi numeri grigi su azzurro, senza bordi e
// senza niente in comune col gestionale. Qui invece la tendina e' la nostra,
// uguale a quelle dei reparti e delle porte SMTP.
//
// Un campo solo e non due — ore e minuti separati occupano il doppio e
// costringono a due gesti per un dato solo. La lista e' lunga, ma si apre gia'
// ferma sull'ora scelta, quindi la si sfoglia da li'.
//
// Il valore resta la stessa stringa "HH:MM" di prima: chi lo legge, dal
// database alle azioni del server, non si accorge del cambio.

function due(n: number): string {
  return String(n).padStart(2, "0");
}

export default function CampoOra({
  value,
  defaultValue,
  onChange,
  name,
  passo = 15,
  size = "md",
  etichetta,
  className,
}: {
  // Controllato con `value`, oppure lasciato a se' con `defaultValue`: dentro
  // a un form del server basta il secondo, piu' `name`.
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  // Ogni quanti minuti si puo' scegliere.
  passo?: number;
  size?: "md" | "sm";
  // Cosa e' questa tendina, per chi naviga a voce.
  etichetta?: string;
  className?: string;
}) {
  const [interno, setInterno] = useState(defaultValue ?? "");
  const corrente = value ?? interno;

  const salto = Math.max(1, passo);
  const orari: string[] = [];
  for (let m = 0; m < 24 * 60; m += salto) {
    orari.push(`${due(Math.floor(m / 60))}:${due(m % 60)}`);
  }
  // Un orario gia' salvato che non cade sui passi resta scegliibile: cambiare
  // il passo dopo non deve far sparire dalla tendina l'ora di una prenotazione
  // che esiste.
  if (corrente && !orari.includes(corrente)) {
    orari.push(corrente);
    orari.sort();
  }

  function scegli(v: string) {
    if (value === undefined) setInterno(v);
    onChange?.(v);
  }

  return (
    <>
      {name && <input type="hidden" name={name} value={corrente} />}
      <Select
        size={size}
        className={className ?? "w-[6.75rem]"}
        value={corrente}
        placeholder="––:––"
        ariaLabel={etichetta}
        onChange={scegli}
        options={[
          // Serve a svuotare una fascia compilata per sbaglio: senza, l'unico
          // modo per tornare indietro sarebbe chiudere il giorno intero.
          { value: "", label: "––:––" },
          ...orari.map((o) => ({ value: o, label: o })),
        ]}
      />
    </>
  );
}
