import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { contestoOrdineWeb, ordinePerToken } from "@/lib/ordini-web";
import { formatKm, formatPrice } from "@/lib/format";
import { getChannel } from "@/lib/channels";
import { STILE_PRENOTA } from "@/components/prenota/stile";

// L'ordine visto da chi l'ha fatto. Ci si arriva col link che il token porta
// nell'indirizzo: e' l'unico modo che ha il cliente di ritrovare il suo ordine
// senza un account, ed e' anche quello che gli dice se il locale l'ha preso.

export const metadata: Metadata = {
  title: "Il tuo ordine",
  // Un ordine col nome e il telefono di qualcuno non finisce su Google.
  robots: { index: false, follow: false },
};

function quandoLeggibile(d: Date): string {
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

export default async function OrdinePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await contestoOrdineWeb();
  if (!ctx) notFound();

  const ordine = await ordinePerToken(ctx.tenantId, token);
  if (!ordine) notFound();

  const canale = getChannel(ordine.canale);
  const ritiro = ordine.canale === "asporto";
  const imponibile = ordine.totaleCents - ordine.consegnaCents;

  // Le tre cose che il cliente vuole sapere, in tre frasi diverse: se l'hanno
  // preso, per quando, e quanto paga. "In preparazione" e "pronto" sono lo
  // stesso passo per chi aspetta — l'ordine c'e' — e non vale la pena
  // inventargli due schermate.
  const stato =
    ordine.stato === "pending"
      ? {
          titolo: "Ordine ricevuto",
          testo:
            "Il locale lo sta guardando: appena lo conferma, quello che hai scelto va in preparazione. Se qualcosa non torna ti chiamano.",
          badge: "badge-warn",
          etichetta: "Da confermare",
        }
      : ordine.stato === "served" || ordine.stato === "rejected"
        ? ordine.stato === "served"
          ? {
              titolo: ritiro ? "Ritirato" : "Consegnato",
              testo: "Questo ordine è chiuso. Grazie!",
              badge: "badge-muted",
              etichetta: "Chiuso",
            }
          : {
              titolo: "Ordine rifiutato",
              testo:
                "Il locale non è riuscito a prenderlo. Se non ti hanno già chiamato, prova a sentirli.",
              badge: "badge-danger",
              etichetta: "Rifiutato",
            }
        : {
            titolo: "Ordine confermato",
            testo: ritiro
              ? "È tutto a posto: passa a ritirarlo all'ora concordata."
              : "È tutto a posto: te lo portiamo all'indirizzo che hai scritto.",
            badge: "badge-ok",
            etichetta: "Confermato",
          };

  return (
    <main className="pr">
      <style dangerouslySetInnerHTML={{ __html: STILE_PRENOTA }} />

      <div className="pr-guscio">
        <header className="text-center">
          {ctx.logoUrl ? (
            <div className="pr-logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ctx.logoUrl} alt={ctx.nome} className="h-11 w-auto" />
            </div>
          ) : (
            <div className="text-xl font-semibold">{ctx.nome}</div>
          )}

          <div className="pr-occhiello mt-6">{canale.label}</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {stato.titolo}
          </h1>
          <p
            className="mx-auto mt-3 max-w-sm text-sm"
            style={{ color: "var(--muted)" }}
          >
            {stato.testo}
          </p>
        </header>

        <div className="pr-riepilogo mt-8">
          <span className={`badge ${stato.badge}`}>{stato.etichetta}</span>
          {ordine.quando && (
            <span>
              {ritiro ? "Ritiro" : "Consegna"} {quandoLeggibile(ordine.quando)}
            </span>
          )}
        </div>

        <section className="pr-passo">
          <h2 className="pr-titolo-passo">Cosa hai ordinato</h2>
          <ul className="mt-3 space-y-2">
            {ordine.voci.map((v, i) => (
              <li
                key={i}
                className="flex items-start justify-between gap-3 text-sm"
                style={v.annullata ? { opacity: 0.5 } : undefined}
              >
                <span className="min-w-0">
                  <span className="tnum">{v.quantita}×</span>{" "}
                  <span
                    style={
                      v.annullata ? { textDecoration: "line-through" } : undefined
                    }
                  >
                    {v.nome}
                  </span>
                  {v.note && (
                    <span
                      className="block text-xs"
                      style={{ color: "var(--muted)" }}
                    >
                      {v.note}
                    </span>
                  )}
                  {v.annullata && (
                    <span className="block text-xs" style={{ color: "var(--muted)" }}>
                      tolto dal locale
                    </span>
                  )}
                </span>
                <span className="tnum whitespace-nowrap">
                  {formatPrice(v.prezzoCents * v.quantita)}
                </span>
              </li>
            ))}
          </ul>

          <div
            className="mt-3 border-t pt-3 text-sm"
            style={{ borderColor: "var(--border)" }}
          >
            {ordine.consegnaCents > 0 && (
              <div className="flex justify-between" style={{ color: "var(--muted)" }}>
                <span>Consegna{ordine.km !== null && ` · ${formatKm(ordine.km)}`}</span>
                <span className="tnum">{formatPrice(ordine.consegnaCents)}</span>
              </div>
            )}
            {ordine.canale === "domicilio" && ordine.consegnaCents === 0 && (
              <div className="flex justify-between" style={{ color: "var(--muted)" }}>
                <span>Consegna</span>
                <span>{ordine.km === null ? "da confermare" : "offerta"}</span>
              </div>
            )}
            <div className="mt-1 flex justify-between font-semibold">
              <span>Totale</span>
              <span className="tnum">{formatPrice(ordine.totaleCents)}</span>
            </div>
            <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
              {ritiro
                ? "Si paga al ritiro, in cassa."
                : "Si paga alla consegna, al fattorino."}{" "}
              L&apos;imponibile delle consumazioni è {formatPrice(imponibile)}.
            </p>
          </div>
        </section>

        <section className="pr-passo">
          <h2 className="pr-titolo-passo">I tuoi dati</h2>
          <div className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
            <div>{ordine.nome}</div>
            {ordine.telefono && <div>{ordine.telefono}</div>}
            {ordine.indirizzo && <div>{ordine.indirizzo}</div>}
          </div>
        </section>

        <div className="pr-avviso mt-6">
          Serve cambiare qualcosa?{" "}
          {ctx.telefono ? (
            <>
              Chiama il locale allo{" "}
              <a href={`tel:${ctx.telefono}`} className="underline">
                {ctx.telefono}
              </a>
              : da qui l&apos;ordine non si modifica.
            </>
          ) : (
            "Chiama il locale: da qui l'ordine non si modifica."
          )}
        </div>

        <p className="mt-6 text-center text-xs" style={{ color: "var(--muted)" }}>
          Tieni da parte questo indirizzo: è l&apos;unico modo per ritrovare
          l&apos;ordine.
        </p>
      </div>
    </main>
  );
}
