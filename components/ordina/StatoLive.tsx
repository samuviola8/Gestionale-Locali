"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/format";
import type { FaseOrdine } from "@/lib/ordini-web";

// A che punto e' l'ordine, mentre il cliente aspetta.
//
// Si aggiorna da sola ogni venti secondi: chi aspetta una pizza tiene la
// pagina aperta e guarda, e costringerlo a ricaricare per sapere se e' pronta
// e' esattamente la telefonata che questo modulo dovrebbe togliere. Quando
// l'ordine e' chiuso o rifiutato smette di chiedere: non c'e' piu' niente da
// sapere, e un sondaggio ogni venti secondi per sempre e' maleducazione.

const PASSO_MS = 20000;

type Stato = {
  fase: FaseOrdine;
  // L'ora concordata sta nello stato e non nella pagina perche' e' l'unica
  // cosa che il locale puo' cambiare mentre il cliente sta guardando: chi
  // accetta un ordine per le 20:30 puo' rimandarlo alle 21, ed e' l'ora per
  // cui il cliente esce di casa. Saperla solo ricaricando non serve a niente.
  quando: string | null;
  readyAt: string | null;
  outAt: string | null;
  totaleCents: number;
  consegnaCents: number;
};

type Tappa = {
  fase: FaseOrdine;
  titolo: string;
  detto: string;
};

function tappe(domicilio: boolean): Tappa[] {
  return [
    {
      fase: "ricevuto",
      titolo: "Ricevuto",
      detto: "Il locale lo sta guardando.",
    },
    {
      fase: "confermato",
      titolo: "Confermato",
      detto: domicilio
        ? "È tutto a posto: te lo prepariamo."
        : "È tutto a posto: te lo prepariamo.",
    },
    {
      fase: "preparazione",
      titolo: "In preparazione",
      detto: "Ci stanno lavorando adesso.",
    },
    {
      fase: "pronto",
      titolo: "Pronto",
      detto: domicilio
        ? "È pronto: sta per uscire dal locale."
        : "È pronto: quando vuoi passa a ritirarlo.",
    },
    ...(domicilio
      ? [
          {
            fase: "in-consegna" as const,
            titolo: "In consegna",
            detto: "È uscito dal locale: sta arrivando da te.",
          },
        ]
      : []),
    {
      fase: "chiuso",
      titolo: domicilio ? "Consegnato" : "Ritirato",
      detto: "Questo ordine è chiuso. Grazie!",
    },
  ];
}

function ora(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// "oggi alle 20:30", "venerdì 5 settembre alle 21:00": l'ora da leggere di
// sfuggita, non da decifrare.
function quandoLeggibile(iso: string): string {
  const d = new Date(iso);
  const oggi = new Date();
  const stessoGiorno =
    d.getFullYear() === oggi.getFullYear() &&
    d.getMonth() === oggi.getMonth() &&
    d.getDate() === oggi.getDate();
  const ora = d.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (stessoGiorno) return `oggi alle ${ora}`;
  return `${d.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })} alle ${ora}`;
}
export default function StatoLive({
  token,
  iniziale,
  domicilio,
  nome,
  telefono,
}: {
  token: string;
  iniziale: Stato;
  domicilio: boolean;
  nome: string | null;
  telefono: string | null;
}) {
  const [stato, setStato] = useState<Stato>(iniziale);

  useEffect(() => {
    if (stato.fase === "chiuso" || stato.fase === "rifiutato") return;

    let vivo = true;
    async function leggi() {
      try {
        const r = await fetch(`/api/ordine/${token}`, { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json();
        if (!vivo || !d.ok) return;
        setStato({
          fase: d.fase,
          quando: d.quando,
          readyAt: d.readyAt,
          outAt: d.outAt,
          totaleCents: d.totaleCents,
          consegnaCents: d.consegnaCents,
        });
      } catch {
        // rete assente: si riprova al giro dopo, e intanto resta quello che
        // c'era. Un errore a schermo qui servirebbe solo a spaventare.
      }
    }

    const t = setInterval(leggi, PASSO_MS);
    // Tornando sulla pagina si guarda subito, senza aspettare il giro: e' il
    // momento in cui uno la riapre proprio per sapere.
    function alRitorno() {
      if (document.visibilityState === "visible") leggi();
    }
    document.addEventListener("visibilitychange", alRitorno);

    return () => {
      vivo = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", alRitorno);
    };
  }, [token, stato.fase]);

  if (stato.fase === "rifiutato") {
    return (
      <div className="pr-avviso mt-8" style={{ color: "var(--danger)" }}>
        <strong>Il locale non è riuscito a prendere questo ordine.</strong> Non
        è stato preparato niente e non devi niente.
        {telefono && (
          <>
            {" "}
            Se vuoi riprovare con un altro orario, chiama il{" "}
            <a href={`tel:${telefono}`} className="underline">
              {telefono}
            </a>
            .
          </>
        )}
      </div>
    );
  }

  const elenco = tappe(domicilio);
  const arrivato = elenco.findIndex((t) => t.fase === stato.fase);
  const quandoDi = (fase: FaseOrdine) =>
    fase === "pronto"
      ? ora(stato.readyAt)
      : fase === "in-consegna"
        ? ora(stato.outAt)
        : null;

  // L'ora e' cambiata da quando questa pagina e' stata aperta: il cliente
  // magari la sta guardando proprio adesso, e la riga che si riscrive da sola
  // in grigio piccolo se la perde. Questa invece la vede.
  const rimandato = !!(
    stato.quando &&
    iniziale.quando &&
    stato.quando !== iniziale.quando
  );

  return (
    <div>
      {stato.quando && (
        <p
          className="mx-auto mt-3 max-w-sm text-center text-sm"
          style={{ color: "var(--muted)" }}
        >
          {domicilio ? "Consegna" : "Ritiro"} {quandoLeggibile(stato.quando)}
          {nome ? `, a nome di ${nome}` : ""}.
        </p>
      )}

      {rimandato && (
        <p role="status" className="pr-avviso mt-6">
          <strong>Il locale ha spostato l&apos;ora.</strong>{" "}
          {domicilio ? "La consegna è" : "Il ritiro è"}{" "}
          {quandoLeggibile(stato.quando!)}.
        </p>
      )}

      <ol className="or-passi mt-8">
        {elenco.map((t, i) => {
          const fatto = i < arrivato;
          const adesso = i === arrivato;
          const orario = quandoDi(t.fase);
          return (
            <li
              key={t.fase}
              className="or-passo-riga"
              data-stato={adesso ? "adesso" : fatto ? "fatto" : "dopo"}
              aria-current={adesso ? "step" : undefined}
            >
              <span className="or-pallino">{fatto ? "✓" : ""}</span>
              <span className="min-w-0">
                <span className="or-passo-titolo">
                  {t.titolo}
                  {orario && <span className="tnum"> · {orario}</span>}
                </span>
                {adesso && <span className="or-passo-detto">{t.detto}</span>}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="mt-3 text-center text-xs" style={{ color: "var(--muted)" }}>
        Questa pagina si aggiorna da sola: tienila pure aperta.
      </p>

      {stato.totaleCents !== iniziale.totaleCents && (
        <p
          role="status"
          className="pr-avviso mt-4"
          style={{ color: "var(--warn-text)" }}
        >
          Il totale è cambiato: adesso è {formatPrice(stato.totaleCents)}. Se
          non te l&apos;hanno detto, chiedi al locale.
        </p>
      )}
    </div>
  );
}
