"use client";

import { useState } from "react";
import { etichettaTavoli } from "@/lib/format";

// Quali tavoli dare a una prenotazione, scegliendoli a mano.
//
// L'assegnazione automatica fa quello che puo' con la sala di stasera, ma non
// sa che il tavolo in fondo balla, che quei due si sentono solo se stanno
// vicini, e che la comitiva da diciotto la si vuole tutta sulla stessa fila.
// Il menu a scelta singola di prima permetteva solo di sostituire un tavolo
// con un altro: la tavolata su tre tavoli non era scrivibile in nessun modo.
//
// Qui si toccano i tavoli uno per uno e si guarda salire il totale dei posti,
// che e' esattamente il conto che si fa a mente davanti alla sala.

export type TavoloScelta = {
  numero: number;
  posti: number;
  prenotabile: boolean;
  // Perche' darlo a questo gruppo e' un problema, gia' scritto per esteso:
  // «c'e' gente seduta adesso», «lo tiene Ferrari alle 20:30». Non e' un
  // divieto — chi guarda la sala decide lui — ma nessuno deve scoprirlo dopo.
  avviso: string | null;
};

export default function ScegliTavoli({
  reservationId,
  tavoli,
  assegnati,
  persone,
  sedieExtra,
  assegna,
}: {
  reservationId: string;
  tavoli: TavoloScelta[];
  assegnati: number[];
  persone: number;
  // Le sedie che il locale ha detto di poter aggiungere a ogni tavolo: fanno
  // parte della capienza vera, come nell'assegnazione automatica.
  sedieExtra: number;
  assegna: (formData: FormData) => Promise<void>;
}) {
  const [scelti, setScelti] = useState<number[]>(assegnati);

  const ordinati = [...scelti].sort((a, b) => a - b);
  const capienza = tavoli
    .filter((t) => scelti.includes(t.numero))
    .reduce((s, t) => s + t.posti + sedieExtra, 0);
  const bastano = capienza >= persone;
  const cambiato =
    ordinati.join("+") !== [...assegnati].sort((a, b) => a - b).join("+");
  // Un tavolo che in quella fascia e' di qualcun altro. Si puo' scegliere lo
  // stesso — chi guarda la sala sa cose che il sistema non sa — ma deve
  // saperlo, perche' l'altro gruppo non se ne accorge da nessuna parte.
  const sovrapposti = tavoli.filter(
    (t) => scelti.includes(t.numero) && t.avviso
  );

  function tocca(numero: number) {
    setScelti((s) =>
      s.includes(numero) ? s.filter((n) => n !== numero) : [...s, numero]
    );
  }

  return (
    <form action={assegna}>
      <input type="hidden" name="id" value={reservationId} />
      <input type="hidden" name="tavoli" value={ordinati.join("+")} />

      <div className="flex flex-wrap gap-1.5">
        {tavoli.map((t) => {
          const scelto = scelti.includes(t.numero);
          return (
            <button
              key={t.numero}
              type="button"
              onClick={() => tocca(t.numero)}
              aria-pressed={scelto}
              title={[
                `Tavolo ${t.numero}, ${t.posti + sedieExtra} posti`,
                t.prenotabile ? null : "non prenotabile dal web",
                t.avviso,
              ]
                .filter(Boolean)
                .join(" · ")}
              className="min-w-[3.25rem] rounded-xl px-2 py-1.5 text-center leading-tight transition"
              style={{
                // Tratteggiato il tavolo che dal web non si da' a nessuno: il
                // bancone c'e' e per una comitiva si usa, ma non fa parte
                // della sala che il sistema assegna da solo.
                border: `1px ${t.prenotabile ? "solid" : "dashed"} ${
                  scelto ? "var(--brand)" : "var(--border)"
                }`,
                background: scelto ? "var(--brand-50)" : "var(--surface)",
                color: scelto ? "var(--brand-text)" : "var(--text)",
              }}
            >
              {/* Numero sopra e posti sotto, non affiancati: «5 6» si legge
                  come il tavolo cinquantasei. */}
              <span className="block text-sm font-semibold">
                {t.numero}
                {t.avviso && (
                  <span style={{ color: "var(--warn)" }} aria-hidden="true">
                    {" "}
                    ●
                  </span>
                )}
              </span>
              <span className="block text-[10px] opacity-70">
                {t.posti + sedieExtra} posti
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-sm tnum">
          {ordinati.length ? (
            <>
              <strong>{etichettaTavoli(ordinati)}</strong>
              {" · "}
              <span style={{ color: bastano ? "var(--ok)" : "var(--warn)" }}>
                {capienza} posti per {persone}{" "}
                {persone === 1 ? "persona" : "persone"}
              </span>
            </>
          ) : (
            <span style={{ color: "var(--muted)" }}>
              Nessun tavolo: la prenotazione resta senza posto assegnato.
            </span>
          )}
        </span>

        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-primary btn-sm"
            disabled={!cambiato}
            type="submit"
          >
            Salva i tavoli
          </button>
          {cambiato && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setScelti(assegnati)}
            >
              Annulla
            </button>
          )}
          {ordinati.length > 0 && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setScelti([])}
            >
              Togli tutti
            </button>
          )}
        </div>
      </div>

      {sovrapposti.length > 0 && (
        <div className="mt-2 text-xs" style={{ color: "var(--warn)" }}>
          {sovrapposti.map((t) => (
            <p key={t.numero}>
              Tavolo {t.numero}: {t.avviso}.
            </p>
          ))}
          <p className="mt-1">
            Puoi darglielo lo stesso — la sala la vedete voi — ma chi c&apos;è
            adesso non si sposta da solo.
          </p>
        </div>
      )}

      {ordinati.length > 0 && !bastano && (
        <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
          Ci stanno {capienza} persone e ne arrivano {persone}: aggiungi un
          tavolo, o tienilo così se in sala sai come sistemarli.
        </p>
      )}
    </form>
  );
}
