import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { localeDalSito, ordinePerToken } from "@/lib/ordini-web";
import { formatKm, formatPrice } from "@/lib/format";
import { getChannel } from "@/lib/channels";
import StatoLive from "@/components/ordina/StatoLive";
import { MarchioMenu } from "@/components/Firma";
import Recensione from "@/components/Recensione";
import { daChiedere } from "@/lib/recensioni";
import { lasciaRecensione, lasciaTestimonianza } from "../actions";
import { STILE_PRENOTA } from "@/components/prenota/stile";
import { STILE_ORDINA } from "@/components/ordina/stile";

// L'ordine visto da chi l'ha fatto. Ci si arriva col link che il token porta
// nell'indirizzo — quello che gli e' arrivato per mail, e quello che il sito si
// ricorda — ed e' l'unico modo che ha il cliente di ritrovare il suo ordine
// senza un account.
//
// La pagina non chiede che il locale stia ancora vendendo dal sito: l'asporto
// si puo' spegnere alle 23:00, e chi ha ordinato alle 22:30 deve continuare a
// vedere a che punto e' il suo.
export const metadata: Metadata = {
  title: "Il tuo ordine",
  // Un ordine col nome e il telefono di qualcuno non finisce su Google.
  robots: { index: false, follow: false },
};

export default async function OrdinePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const locale = await localeDalSito();
  if (!locale) notFound();

  const ordine = await ordinePerToken(locale.tenantId, token);
  if (!ordine) notFound();

  const canale = getChannel(ordine.canale);
  const domicilio = ordine.canale === "domicilio";
  const imponibile = ordine.totaleCents - ordine.consegnaCents;

  // La domanda si fa a cose fatte, e non un minuto prima: a un ordine ancora
  // in preparazione non si chiede com'e' andata, perche' non e' ancora andata.
  const recensione =
    ordine.fase === "chiuso"
      ? await daChiedere(locale.tenantId, ordine.id)
      : { chiedi: false, url: null, dove: null };

  return (
    <main className="pr">
      <style dangerouslySetInnerHTML={{ __html: STILE_PRENOTA + STILE_ORDINA }} />

      <div className="pr-guscio">
        <header className="text-center">
          {locale.logoUrl ? (
            <div className="pr-logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={locale.logoUrl} alt={locale.nome} className="h-11 w-auto" />
            </div>
          ) : (
            <div className="text-xl font-semibold">{locale.nome}</div>
          )}

          <div className="pr-occhiello mt-6">{canale.label}</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Il tuo ordine
          </h1>
        </header>

        {/* I passi e l'ora si aggiornano da soli: chi aspetta tiene la pagina
            aperta, e l'ora concordata e' proprio la cosa che il locale puo'
            cambiare mentre la guarda. */}
        <StatoLive
          token={token}
          domicilio={domicilio}
          nome={ordine.nome}
          telefono={locale.telefono}
          iniziale={{
            fase: ordine.fase,
            quando: ordine.quando?.toISOString() ?? null,
            readyAt: ordine.readyAt?.toISOString() ?? null,
            outAt: ordine.outAt?.toISOString() ?? null,
            totaleCents: ordine.totaleCents,
            consegnaCents: ordine.consegnaCents,
          }}
        />

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
            {domicilio && ordine.consegnaCents === 0 && (
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
              {domicilio
                ? "Si paga alla consegna, al fattorino."
                : "Si paga al ritiro, in cassa."}{" "}
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
          {locale.telefono ? (
            <>
              Chiama il locale allo{" "}
              <a href={`tel:${locale.telefono}`} className="underline">
                {locale.telefono}
              </a>
              : da qui l&apos;ordine non si modifica.
            </>
          ) : (
            "Chiama il locale: da qui l'ordine non si modifica."
          )}
        </div>

        <p className="mt-6 text-center text-xs" style={{ color: "var(--muted)" }}>
          Tieni da parte questo indirizzo: è l&apos;unico modo per ritrovare
          l&apos;ordine. Se ci hai lasciato la mail, ce l&apos;hai anche lì.
        </p>

        {recensione.chiedi && (
          <Recensione
            nomeLocale={locale.nome}
            url={recensione.url}
            dove={recensione.dove}
            salva={async (voto, testo) => {
              "use server";
              return lasciaRecensione(token, voto, testo);
            }}
            salvaComanda={async (voto, testo, firma, pubblicabile) => {
              "use server";
              return lasciaTestimonianza(token, voto, testo, firma, pubblicabile);
            }}
          />
        )}

        {locale.marchio && <MarchioMenu cosa="Ordina" />}
      </div>
    </main>
  );
}
