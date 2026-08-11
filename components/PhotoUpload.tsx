"use client";

import { useState } from "react";

// Il campo file nativo mostra "Scegli file / nessun file selezionato": su una
// lista di centocinquanta prodotti diventa rumore. Qui il controllo e' un
// pulsante normale, con l'input vero nascosto ma raggiungibile da tastiera.
export default function PhotoUpload({
  label,
  // L'input vero e' nascosto: senza un nome esplicito i lettori di schermo
  // annunciano un controllo muto.
  ariaLabel,
  // Nelle righe della lista la foto e' l'unico campo del form: appena si
  // sceglie il file si puo' inviare, risparmiando un tocco.
  autoSubmit = false,
}: {
  label: string;
  ariaLabel?: string;
  autoSubmit?: boolean;
}) {
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-2">
      <label className="btn btn-sm" style={{ cursor: "pointer" }}>
        {label}
        <input
          type="file"
          name="image"
          accept="image/png,image/jpeg,image/webp"
          aria-label={ariaLabel ?? label}
          className="sr-only"
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            setFileName(f ? f.name : null);
            if (autoSubmit && f) e.currentTarget.form?.requestSubmit();
          }}
        />
      </label>
      {fileName && !autoSubmit && (
        <span
          className="max-w-[140px] truncate text-xs"
          style={{ color: "var(--muted)" }}
          title={fileName}
        >
          {fileName}
        </span>
      )}
    </span>
  );
}
