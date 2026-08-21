import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { formatPrice } from "@/lib/format";
import { MODULES, getTenantModules } from "@/lib/modules";
import { getContratto, etichettaPeriodo } from "@/lib/billing/contratti";
import { getPacchetti, getPrezziModuli } from "@/lib/billing/prezzi";
import { getAddons } from "@/lib/billing/addons";
import { usoInProva } from "@/lib/billing/prova";
import { cambiaPiano } from "../actions";

// Dove il locale sceglie il suo piano.
//
// Non e' una pagina di vendita: e' una decisione che prende un titolare fra
// un servizio e l'altro, e la domanda vera non e' "quale piano e' il piu'
// bello" ma "quale mi basta". Percio' al centro non ci sono i prezzi ma
// **quello che ha usato davvero**: ogni riga della tabella che ha toccato in
// prova porta il suo numero accanto, e la colonna consigliata e' il conto di
// quei numeri, non una scelta di marketing.
//
// Sta dentro la dashboard, che ogni locale vede col proprio logo e il proprio
// colore: quindi niente font o palette forestieri: la pagina usa i token del
// tema del locale. Il carattere ce lo mette il contenuto.

export default async function PacchettiLocalePage() {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  if (session.role !== "owner") redirect("/dashboard");

  const [contratto, pacchetti, moduli, prezziModuli, addons] = await Promise.all([
    getContratto(session.tenantId),
    getPacchetti(session.tenantId),
    getTenantModules(session.tenantId),
    getPrezziModuli(session.tenantId),
    getAddons(session.tenantId),
  ]);

  const inProva = contratto?.status === "prova";
  const uso =
    inProva && contratto
      ? await usoInProva(session.tenantId, contratto.createdAt)
      : null;
  const usoPerModulo = new Map(uso?.voci.map((v) => [v.key, v]) ?? []);
  const consigliato = uso?.paccoConsigliato ?? null;

  // Le righe della tabella: i moduli che compaiono in almeno un pacchetto.
  // Gli add-on stanno sotto, perche' non fanno parte del confronto — si
  // aggiungono a qualsiasi piano.
  const righe = MODULES.filter((m) => pacchetti.some((p) => p.moduli.includes(m.key)));
  const extra = MODULES.filter(
    (m) => !pacchetti.some((p) => p.moduli.includes(m.key)) && prezziModuli[m.key] > 0
  );

  const prezzoDi = (p: (typeof pacchetti)[number]) =>
    contratto?.model === "impianto"
      ? p.assistenzaCents
      : contratto?.period === "annuale"
        ? p.annualeCents
        : p.mensileCents;

  return (
    <div className="space-y-8">
      <div>
        <a
          href="/dashboard/fatturazione"
          className="text-sm hover:underline"
          style={{ color: "var(--muted)" }}
        >
          ← Abbonamento e fatture
        </a>
        <h1 className="mt-2 text-xl font-semibold">Scegli il tuo piano</h1>
        <p className="mt-1 max-w-2xl text-sm" style={{ color: "var(--muted)" }}>
          {uso && uso.voci.length > 0 ? (
            <>
              Accanto a ogni riga c&apos;e&apos; quante volte l&apos;hai usata in{" "}
              {uso.giorni} giorni di prova. Il piano in evidenza e&apos; il
              piu&apos; piccolo che copre tutto quello che hai toccato.
            </>
          ) : (
            <>
              Cosa comprende ogni piano. Puoi cambiarlo quando vuoi: salire vale
              subito, scendere dal rinnovo.
            </>
          )}
        </p>
      </div>

      {/* Le colonne. Su telefono diventano schede impilate: una tabella a
          quattro colonne su 375px non si legge, e questa pagina si apre quasi
          sempre col telefono in mano dietro al bancone. */}
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: `repeat(${Math.min(pacchetti.length, 2)}, minmax(0, 1fr))`,
        }}
      >
        {pacchetti.map((p) => {
          const attuale = p.key === contratto?.pack;
          const programmato = p.key === contratto?.pendingPack;
          const suggerito = p.key === consigliato && !attuale && !programmato;
          const prezzo = prezzoDi(p);
          const sale = contratto ? prezzo > contratto.recurringCents : false;
          return (
            <form
              key={p.key}
              action={cambiaPiano}
              className="card relative flex flex-col p-5"
              style={
                attuale
                  ? { borderColor: "var(--brand)", borderWidth: 2 }
                  : suggerito
                    ? { borderColor: "var(--ok)", borderWidth: 2 }
                    : undefined
              }
            >
              <input type="hidden" name="pack" value={p.key} />

              {/* Il piano gia' scelto per il rinnovo va segnato prima del
                  consiglio: una scelta che il locale ha gia' fatto conta piu'
                  di un suggerimento nostro, e vedersi consigliare un piano
                  senza sapere di averne gia' preso un altro e' il modo per
                  sceglierlo due volte. */}
              {(attuale || programmato || suggerito) && (
                <span
                  className="absolute -top-2.5 left-5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  style={
                    attuale
                      ? { background: "var(--brand)", color: "var(--brand-on)" }
                      : programmato
                        ? { background: "var(--warn)", color: "var(--surface)" }
                        : { background: "var(--ok)", color: "var(--surface)" }
                  }
                >
                  {attuale
                    ? "il tuo piano"
                    : programmato
                      ? "dal prossimo rinnovo"
                      : "ti basta questo"}
                </span>
              )}

              <div className="text-base font-semibold">{p.label}</div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="tnum text-3xl font-semibold leading-none">
                  {formatPrice(prezzo)}
                </span>
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  {contratto ? etichettaPeriodo(contratto) : "al mese"}
                </span>
              </div>
              <p className="mt-2 flex-1 text-xs" style={{ color: "var(--muted)" }}>
                {p.descrizione}
              </p>

              {!attuale && !programmato && (
                <button
                  className={`btn btn-sm mt-4 w-full ${suggerito || sale ? "btn-primary" : ""}`}
                  style={
                    suggerito || sale
                      ? undefined
                      : { border: "1px solid var(--border)" }
                  }
                >
                  {inProva
                    ? "Scegli questo"
                    : sale
                      ? "Passa subito"
                      : "Passa al rinnovo"}
                </button>
              )}
              {/* Sul piano che ha adesso il bottone compare solo se c'e' un
                  cambio da annullare: sceglierlo di nuovo, senza niente in
                  attesa, non farebbe nulla. */}
              {attuale &&
                (contratto?.pendingPack ? (
                  <button
                    className="btn btn-sm mt-4 w-full"
                    style={{ border: "1px solid var(--border)" }}
                  >
                    Resta su {p.label}
                  </button>
                ) : (
                  <div
                    className="mt-4 text-center text-xs"
                    style={{ color: "var(--muted)" }}
                  >
                    ce l&apos;hai adesso
                  </div>
                ))}
              {programmato && (
                <div
                  className="mt-4 text-center text-xs"
                  style={{ color: "var(--muted)" }}
                >
                  gia&apos; scelto per il rinnovo
                </div>
              )}
            </form>
          );
        })}
      </div>

      {/* Il confronto vero. La colonna del piano attuale resta colorata anche
          qui: scorrendo trenta righe ci si dimentica quale si aveva. */}
      <section>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th className="p-3 text-left text-xs font-medium" style={{ color: "var(--muted)" }}>
                  Cosa comprende
                </th>
                {pacchetti.map((p) => (
                  <th
                    key={p.key}
                    className="p-3 text-center text-xs font-semibold"
                    style={
                      p.key === contratto?.pack
                        ? { color: "var(--brand-text)" }
                        : undefined
                    }
                  >
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {righe.map((m) => {
                const suo = usoPerModulo.get(m.key);
                return (
                  <tr key={m.key} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{m.label}</span>
                        {/* Il numero suo. E' la sola cosa in questa pagina che
                            un altro locale non vedrebbe uguale, ed e' anche
                            l'unica che risponde davvero a "mi serve?". */}
                        {suo && (
                          <span className="badge badge-brand">
                            {suo.quante} {suo.unita}
                          </span>
                        )}
                        {!suo && moduli[m.key] && (
                          <span className="badge badge-muted">acceso</span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                        {m.description}
                      </div>
                    </td>
                    {pacchetti.map((p) => (
                      <td
                        key={p.key}
                        className="p-3 text-center"
                        style={
                          p.key === contratto?.pack
                            ? { background: "var(--brand-50)" }
                            : undefined
                        }
                      >
                        {p.moduli.includes(m.key) ? (
                          <span style={{ color: "var(--ok)" }} aria-label="compreso">
                            ✓
                          </span>
                        ) : (
                          <span style={{ color: "var(--muted)" }} aria-label="non compreso">
                            —
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}

              <tr style={{ borderTop: "1px solid var(--border)" }}>
                <td className="p-3 text-xs" style={{ color: "var(--muted)" }}>
                  Se paghi un anno in una volta
                </td>
                {pacchetti.map((p) => (
                  <td
                    key={p.key}
                    className="tnum p-3 text-center text-xs"
                    style={
                      p.key === contratto?.pack
                        ? { background: "var(--brand-50)" }
                        : undefined
                    }
                  >
                    {formatPrice(p.annualeCents)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {extra.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium" style={{ color: "var(--muted)" }}>
            Si aggiungono a qualsiasi piano
          </h2>
          <div className="card overflow-hidden">
            {extra.map((m, i) => {
              const preso = addons.find((a) => a.moduleKey === m.key);
              return (
                <div
                  key={m.key}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm"
                  style={i > 0 ? { borderTop: "1px solid var(--border)" } : undefined}
                >
                  <div className="min-w-[200px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{m.label}</span>
                      {preso && <span className="badge badge-brand">ce l&apos;hai</span>}
                      {m.comingSoon && (
                        <span className="badge badge-muted">in arrivo</span>
                      )}
                    </div>
                    <div className="text-xs" style={{ color: "var(--muted)" }}>
                      {m.description}
                    </div>
                  </div>
                  <span className="tnum font-medium">
                    {formatPrice(preso?.priceCents ?? prezziModuli[m.key])}
                  </span>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    al mese
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
            Restano tuoi anche se cambi piano: si pagano a parte. Per accenderne
            uno, scrivici.
          </p>
        </section>
      )}

      <section>
        <div className="card p-5 text-sm">
          <h2 className="text-base font-semibold">
            E se nessuno di questi ti torna?
          </h2>
          <p className="mt-1" style={{ color: "var(--muted)" }}>
            Questi sono i piani standard. Se ti serve una combinazione diversa —
            un piano senza una cosa che non usi, o con una che qui sta solo nel
            piu&apos; grande — <strong>scrivici</strong>: te ne prepariamo uno su
            misura, e da quel momento lo trovi qui accanto agli altri e puoi
            sceglierlo come questi.
          </p>
        </div>
      </section>
    </div>
  );
}
