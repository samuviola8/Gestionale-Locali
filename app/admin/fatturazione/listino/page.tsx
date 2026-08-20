import { richiediAdmin } from "@/lib/admin-auth";
import { MODULES } from "@/lib/modules";
import { PACCHETTI, PREZZI_MODULI } from "@/lib/billing/listino";
import { getPacchetti, getPrezziModuli } from "@/lib/billing/prezzi";
import { getImpostazioni } from "@/lib/billing/impostazioni";
import {
  azzeraListinoAction,
  salvaImpostazioniAction,
  salvaListinoAction,
} from "../actions";

// I valori di partenza: quelli che valgono per tutti finche' non si decide
// altrimenti sul singolo locale. Il prezzo concordato con un cliente si
// scrive nella sua scheda e da li' non lo tocca piu' nessuno — nemmeno un
// ritocco fatto qui dentro sei mesi dopo.

function inEuro(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function Euro({
  name,
  value,
  hint,
}: {
  name: string;
  value: number;
  hint?: string;
}) {
  return (
    <label className="text-sm">
      <span className="text-xs" style={{ color: "var(--muted)" }}>
        {hint}
      </span>
      <input
        name={name}
        defaultValue={inEuro(value)}
        inputMode="decimal"
        className="input mt-1 w-full"
      />
    </label>
  );
}

export default async function ListinoPage() {
  await richiediAdmin();

  const [pacchetti, prezziModuli, impostazioni] = await Promise.all([
    getPacchetti(),
    getPrezziModuli(),
    getImpostazioni(),
  ]);

  // Se un prezzo e' stato ritoccato dal pannello lo si vede accanto: sapere
  // che il codice diceva 49 e adesso dice 59 vale piu' del numero da solo.
  const daCodice = new Map(PACCHETTI.map((p) => [p.key, p]));

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <main className="mx-auto max-w-3xl space-y-8 px-6 py-8">
        <div>
          <a
            href="/admin/fatturazione"
            className="text-sm text-neutral-500 hover:underline"
          >
            ← Fatturazione
          </a>
          <h1 className="mt-2 text-2xl font-semibold">Listino e regole</h1>
          <p className="mt-1 text-sm text-neutral-500">
            I valori di partenza per tutti i locali. Quello che si concorda con
            un cliente si scrive nella sua scheda e resta suo.
          </p>
        </div>

        <section>
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>
            Regole
          </h2>
          <form
            action={salvaImpostazioniAction}
            className="card grid gap-3 p-4 sm:grid-cols-3"
          >
            <label className="text-sm">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Prova gratuita (giorni)
              </span>
              <input
                name="trialDays"
                type="number"
                min={0}
                max={365}
                defaultValue={impostazioni.trialDays}
                className="input mt-1 w-full"
              />
            </label>
            <label className="text-sm">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Quota sul transato (%)
              </span>
              <input
                name="transactionPct"
                defaultValue={(impostazioni.transactionBps / 100)
                  .toFixed(2)
                  .replace(".", ",")}
                inputMode="decimal"
                className="input mt-1 w-full"
              />
            </label>
            <label className="text-sm">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Tolleranza dopo la scadenza (giorni)
              </span>
              <input
                name="graceDays"
                type="number"
                min={0}
                max={180}
                defaultValue={impostazioni.graceDays}
                className="input mt-1 w-full"
              />
            </label>

            <label className="flex items-start gap-2.5 text-sm sm:col-span-3">
              <input
                type="checkbox"
                name="autoSuspend"
                defaultChecked={impostazioni.autoSuspend}
                className="mt-px"
              />
              <span>
                <span className="font-medium">
                  Spegni da solo chi non paga
                </span>
                <span className="mt-0.5 block text-xs" style={{ color: "var(--muted)" }}>
                  Passata la tolleranza, il locale viene sospeso senza che io
                  faccia niente. Ordinazione al tavolo e pannello di lavoro si
                  fermano; il titolare entra lo stesso e vede cosa deve. Appena
                  la fattura risulta saldata riparte da solo.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2.5 text-sm sm:col-span-3">
              <input
                type="checkbox"
                name="suspendExpiredTrials"
                defaultChecked={impostazioni.suspendExpiredTrials}
                className="mt-px"
              />
              <span>
                <span className="font-medium">Ferma le prove scadute</span>
                <span className="mt-0.5 block text-xs" style={{ color: "var(--muted)" }}>
                  Finita la prova senza contratto, il servizio si spegne. Spento
                  questo, la prova scade sulla carta ma il locale continua a
                  lavorare finche' non decido io.
                </span>
              </span>
            </label>

            <div className="sm:col-span-3">
              <button className="btn btn-sm" style={{ border: "1px solid var(--border)" }}>
                Salva regole
              </button>
            </div>
          </form>
        </section>

        <form action={salvaListinoAction} className="space-y-6">
          <section>
            <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>
              Pacchetti
            </h2>
            <div className="space-y-3">
              {pacchetti.map((p) => {
                const base = daCodice.get(p.key)!;
                const ritoccato = p.mensileCents !== base.mensileCents;
                return (
                  <div key={p.key} className="card p-4">
                    <div className="mb-3 flex flex-wrap items-baseline gap-2">
                      <span className="font-medium">{p.label}</span>
                      <span className="text-xs" style={{ color: "var(--muted)" }}>
                        {p.moduli.length} moduli
                      </span>
                      {ritoccato && (
                        <span className="badge badge-brand">
                          a listino nel codice: {inEuro(base.mensileCents)}
                        </span>
                      )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-4">
                      <Euro
                        name={`pacco_${p.key}_mensile`}
                        value={p.mensileCents}
                        hint="Mensile"
                      />
                      <Euro
                        name={`pacco_${p.key}_annuale`}
                        value={p.annualeCents}
                        hint="Annuale"
                      />
                      <Euro
                        name={`pacco_${p.key}_attivazione`}
                        value={p.attivazioneCents}
                        hint="Attivazione"
                      />
                      <Euro
                        name={`pacco_${p.key}_assistenza`}
                        value={p.assistenzaCents}
                        hint="Assistenza"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>
              Moduli presi da soli
            </h2>
            <div className="card divide-y p-0" style={{ borderColor: "var(--border)" }}>
              {MODULES.map((m) => (
                <div
                  key={m.key}
                  className="flex flex-wrap items-center gap-3 px-4 py-2.5"
                  style={{ borderTop: "1px solid var(--border)" }}
                >
                  <span className="min-w-[180px] flex-1 text-sm">
                    {m.label}
                    {PREZZI_MODULI[m.key] === 0 && (
                      <span className="ml-2 text-xs" style={{ color: "var(--muted)" }}>
                        di serie nei pacchetti
                      </span>
                    )}
                  </span>
                  <input
                    name={`modulo_${m.key}`}
                    defaultValue={inEuro(prezziModuli[m.key])}
                    inputMode="decimal"
                    className="input w-24 text-right"
                  />
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    al mese
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
              Zero vuol dire che non si vende da solo: e&apos; compreso nel
              pacchetto e non compare fra gli add-on da aggiungere a un locale.
            </p>
          </section>

          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary btn-sm">Salva listino</button>
          </div>
        </form>

        <form action={azzeraListinoAction}>
          <button
            className="btn btn-sm"
            style={{ border: "1px solid var(--border)", color: "var(--muted)" }}
          >
            Rimetti i prezzi del codice
          </button>
        </form>
      </main>
    </div>
  );
}
