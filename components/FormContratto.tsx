"use client";

import { useState } from "react";
import { MODELLI, STATI_CONTRATTO } from "@/lib/billing/stati";

// Il contratto di un locale.
//
// E' l'unica parte del pannello che ha bisogno di stare dal lato del browser:
// scegliere un pacchetto deve riempire canone e attivazione col listino
// configurato, senza ricaricare la pagina. Prima quei campi restavano ai
// numeri di prima e li si ricopiava a mano dal listino guardandolo in
// un'altra scheda — cioe' il modo piu' comodo per scrivere 49 dove andava 89.
//
// La regola opposta e' altrettanto importante: appena si corregge un importo
// a mano, il pacchetto diventa "Su misura". Un contratto che dice "Sala" ma
// costa 62 euro sarebbe una bugia scritta nel pannello, e fra sei mesi
// nessuno saprebbe piu' quale delle due cose e' vera.

export type PaccoPrezzato = {
  key: string;
  label: string;
  mensileCents: number;
  annualeCents: number;
  attivazioneCents: number;
  assistenzaCents: number;
};

export type ValoriContratto = {
  model: string;
  pack: string;
  period: string;
  recurringCents: number;
  activationCents: number;
  transactionBps: number;
  status: string;
  provider: string;
  notes: string;
};

const SU_MISURA = "su_misura";

function inEuro(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

// Quello che il listino chiede per questa combinazione. Stessa regola di
// lib/billing/contratti.ts: sull'installazione si paga l'impianto una volta e
// poi l'assistenza al mese, sull'abbonamento c'e' solo il canone.
function daListino(
  p: PaccoPrezzato,
  model: string,
  period: string
): { recurring: number; activation: number } {
  if (model === "impianto") {
    return { recurring: p.assistenzaCents, activation: p.attivazioneCents };
  }
  return {
    recurring: period === "annuale" ? p.annualeCents : p.mensileCents,
    activation: 0,
  };
}

export default function FormContratto({
  tenantId,
  pacchetti,
  valori,
  salva,
  nota,
}: {
  tenantId: string;
  pacchetti: PaccoPrezzato[];
  valori: ValoriContratto;
  salva: (formData: FormData) => Promise<void>;
  /** Le righe di contesto (prova, prossima scadenza) le compone il server. */
  nota?: React.ReactNode;
}) {
  const [model, setModel] = useState(valori.model);
  const [pack, setPack] = useState(valori.pack);
  const [period, setPeriod] = useState(valori.period);
  const [recurring, setRecurring] = useState(inEuro(valori.recurringCents));
  const [activation, setActivation] = useState(inEuro(valori.activationCents));

  const paccoScelto = pacchetti.find((p) => p.key === pack);

  // Cambiare pacchetto, modello o periodo riporta gli importi al listino. Su
  // misura no: li' i numeri sono stati scelti apposta e sovrascriverli
  // sarebbe cancellare una trattativa con un click.
  function riallinea(nuovo: { model?: string; pack?: string; period?: string }) {
    const m = nuovo.model ?? model;
    const k = nuovo.pack ?? pack;
    const pe = nuovo.period ?? period;
    if (nuovo.model !== undefined) setModel(m);
    if (nuovo.pack !== undefined) setPack(k);
    if (nuovo.period !== undefined) setPeriod(pe);

    const p = pacchetti.find((x) => x.key === k);
    if (!p) return;
    const l = daListino(p, m, pe);
    setRecurring(inEuro(l.recurring));
    setActivation(inEuro(l.activation));
  }

  // Toccare un importo a mano NON cambia il pacchetto.
  //
  // Sembrerebbe onesto farlo diventare "Su misura", e per un attimo l'ho
  // fatto — ma il pacchetto non decide solo il prezzo: decide quali moduli
  // sono compresi nel canone. Un locale su "Locale" a prezzo concordato che
  // diventasse "Su misura" si vedrebbe banco, prenotazioni, asporto e rubrica
  // trasformati in add-on a pagamento, e se ne accorgerebbe dalla fattura.
  //
  // Quindi il pacchetto resta — continua a dire cosa e' compreso — e il
  // prezzo fuori listino si segnala e basta. "Su misura" resta una scelta
  // esplicita, per chi non ha nessun pacchetto.
  function importoAMano(quale: "recurring" | "activation", v: string) {
    if (quale === "recurring") setRecurring(v);
    else setActivation(v);
  }

  const suMisura = pack === SU_MISURA;

  const listinoOra = paccoScelto ? daListino(paccoScelto, model, period) : null;
  const fuoriListino =
    !!listinoOra &&
    (recurring !== inEuro(listinoOra.recurring) ||
      activation !== inEuro(listinoOra.activation));

  return (
    <form action={salva} className="card grid gap-3 p-4 sm:grid-cols-2">
      <input type="hidden" name="id" value={tenantId} />

      <label className="text-sm">
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          Come paga
        </span>
        <select
          name="model"
          value={model}
          onChange={(e) => riallinea({ model: e.target.value })}
          className="input mt-1 w-full"
        >
          {MODELLI.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm">
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          Pacchetto
        </span>
        <select
          name="pack"
          value={pack}
          onChange={(e) => riallinea({ pack: e.target.value })}
          className="input mt-1 w-full"
        >
          {pacchetti.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
          <option value={SU_MISURA}>Su misura</option>
        </select>
        {fuoriListino && (
          <span className="badge badge-brand mt-1 inline-block">
            prezzo concordato
          </span>
        )}
      </label>

      <label className="text-sm">
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          Ogni quanto
        </span>
        <select
          name="period"
          value={period}
          onChange={(e) => riallinea({ period: e.target.value })}
          disabled={model === "impianto"}
          className="input mt-1 w-full"
        >
          <option value="mensile">Mensile</option>
          <option value="annuale">Annuale</option>
        </select>
      </label>

      <label className="text-sm">
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          Quanto paga ogni volta (€)
        </span>
        <input
          name="recurring"
          value={recurring}
          onChange={(e) => importoAMano("recurring", e.target.value)}
          inputMode="decimal"
          className="input mt-1 w-full"
        />
        <span className="mt-1 block text-xs" style={{ color: "var(--muted)" }}>
          {model === "impianto"
            ? "assistenza, ogni mese"
            : period === "annuale"
              ? "una volta l'anno"
              : "ogni mese"}
        </span>
      </label>

      <label className="text-sm">
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          Installazione una tantum (€)
        </span>
        <input
          name="activation"
          value={activation}
          onChange={(e) => importoAMano("activation", e.target.value)}
          inputMode="decimal"
          className="input mt-1 w-full"
        />
        <span className="mt-1 block text-xs" style={{ color: "var(--muted)" }}>
          entra nella prima fattura e in nessun&apos;altra
        </span>
      </label>

      <label className="text-sm">
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          La tua percentuale sui pagamenti dal telefono (%)
        </span>
        <input
          name="transactionPct"
          defaultValue={(valori.transactionBps / 100).toFixed(2).replace(".", ",")}
          inputMode="decimal"
          className="input mt-1 w-full"
        />
      </label>

      <label className="text-sm">
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          Stato
        </span>
        <select
          name="status"
          defaultValue={valori.status}
          className="input mt-1 w-full"
        >
          {STATI_CONTRATTO.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      {/* "Con cosa paga" non e' una casella di questo modulo: lo sceglie il
          locale dalla sua dashboard, perche' e' il suo conto corrente. Qui si
          legge e basta — sapere come incassa serve, deciderlo al posto suo no. */}
      <div className="text-sm">
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          Con cosa paga
        </span>
        <div className="mt-1 flex min-h-[44px] items-center">
          {valori.provider === "stripe"
            ? "Carta, addebito automatico"
            : valori.provider === "paypal"
              ? "PayPal"
              : "Bonifico"}
        </div>
        <span className="block text-xs" style={{ color: "var(--muted)" }}>
          lo sceglie lui dal suo pannello
        </span>
      </div>

      <label className="text-sm sm:col-span-2">
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          Note del contratto
        </span>
        <input
          name="notes"
          defaultValue={valori.notes}
          placeholder="Prezzo fondatori bloccato, sconto concordato, ..."
          className="input mt-1 w-full"
        />
      </label>

      <p className="text-xs sm:col-span-2" style={{ color: "var(--muted)" }}>
        {suMisura ? (
          <>
            <strong>Su misura:</strong> nessun pacchetto, quindi niente e&apos;
            compreso nel canone e ogni modulo acceso si paga a parte.
          </>
        ) : fuoriListino ? (
          <>
            <strong>Prezzo concordato:</strong> resta questo anche se il listino
            cambia. Il pacchetto <strong>{paccoScelto?.label}</strong> continua a
            valere per stabilire cosa e&apos; compreso nel canone; risceglierlo
            qui sopra riporta gli importi al listino.
          </>
        ) : paccoScelto ? (
          <>Gli importi arrivano dal listino di <strong>{paccoScelto.label}</strong>.</>
        ) : null}
        {nota}
      </p>

      <div className="sm:col-span-2">
        <button className="btn btn-sm" style={{ border: "1px solid var(--border)" }}>
          Salva contratto
        </button>
      </div>
    </form>
  );
}
