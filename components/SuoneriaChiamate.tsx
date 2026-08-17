"use client";

import { useState } from "react";
import Select from "@/components/Select";
import { SUONI, SUONO_MUTO, suona } from "@/lib/suoni";

// La scelta del suono si prova mentre si sceglie: un elenco di nomi
// ("Trillo", "Carillon") non dice niente finche' non lo si sente, e in un
// locale rumoroso la differenza tra due suoni e' l'unica cosa che conta.
export default function SuoneriaChiamate({ scelto }: { scelto: string }) {
  const [suono, setSuono] = useState(scelto);

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-48 flex-1">
        <Select
          name="suono"
          value={suono}
          onChange={(v) => {
            setSuono(v);
            // Toccare un'opzione e' gia' il gesto che serve al browser per
            // lasciar suonare: si sente subito, senza un secondo tocco.
            suona(v);
          }}
          options={[
            ...SUONI.map((s) => ({ value: s.chiave, label: s.nome })),
            { value: SUONO_MUTO, label: "Nessun suono" },
          ]}
        />
      </div>
      <button
        type="button"
        onClick={() => suona(suono)}
        disabled={suono === SUONO_MUTO}
        className="btn btn-sm"
      >
        Riascolta
      </button>
    </div>
  );
}
