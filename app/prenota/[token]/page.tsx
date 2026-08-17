import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { reservations } from "@/lib/db/schema";
import {
  BADGE_STATO,
  ETICHETTA_STATO,
  contestoPrenotazione,
  etichettaTavoli,
  giornoLeggibile,
  isStato,
} from "@/lib/prenotazioni";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { STILE_PRENOTA } from "@/components/prenota/stile";
import { accettaSpostamento, annullaDalModulo } from "../actions";

// Riepilogo della prenotazione. E' l'unica cosa che il cliente si porta via:
// niente account, niente app — un indirizzo che gli dice cosa ha prenotato e
// gli permette di disdire con un tocco.

export const metadata: Metadata = {
  title: "La tua prenotazione",
  // Un link con dentro nome e telefono di una persona non va in nessun indice.
  robots: { index: false, follow: false },
};

function Riga({ voce, valore }: { voce: string; valore: string }) {
  return (
    <div
      className="flex items-baseline justify-between gap-4 border-t py-2.5 text-sm"
      style={{ borderColor: "var(--border)" }}
    >
      <span style={{ color: "var(--muted)" }}>{voce}</span>
      <span className="text-right font-medium">{valore}</span>
    </div>
  );
}

export default async function PrenotazionePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const ctx = await contestoPrenotazione();
  if (!ctx) notFound();

  const { token } = await params;
  const [p] = await db
    .select()
    .from(reservations)
    .where(
      and(eq(reservations.token, token), eq(reservations.tenantId, ctx.tenantId))
    )
    .limit(1);
  if (!p) notFound();

  const adesso = new Date();
  const stato = isStato(p.status) ? p.status : "confirmed";
  const passata = p.startsAt.getTime() < adesso.getTime();
  const disdicibile =
    !passata && ["pending", "confirmed", "proposed"].includes(stato);

  const ora = p.startsAt.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <main className="pr">
      <style dangerouslySetInnerHTML={{ __html: STILE_PRENOTA }} />

      <div className="pr-guscio" style={{ maxWidth: 460 }}>
        <header className="text-center">
          {ctx.logoUrl ? (
            <div className="pr-logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ctx.logoUrl} alt={ctx.nome} className="h-11 w-auto" />
            </div>
          ) : (
            <div className="text-xl font-semibold">{ctx.nome}</div>
          )}

          <div className="pr-occhiello mt-6">
            {stato === "pending"
              ? "Richiesta inviata"
              : stato === "confirmed"
                ? "Tavolo prenotato"
                : stato === "proposed"
                  ? "Nuovo orario proposto"
                  : "Prenotazione"}
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            <span className="cap-prima">
              {giornoLeggibile(p.startsAt, adesso)}
            </span>{" "}
            alle {ora}
          </h1>
          <div className="mt-3">
            <span className={"badge " + BADGE_STATO[stato]}>
              {ETICHETTA_STATO[stato]}
            </span>
          </div>
        </header>

        <section className="card mt-7 px-4 py-1.5">
          <div className="[&>div:first-child]:border-t-0">
            <Riga
              voce="Persone"
              valore={`${p.partySize} ${p.partySize === 1 ? "persona" : "persone"}`}
            />
            <Riga voce="A nome di" valore={p.customerName} />
            <Riga voce="Telefono" valore={p.customerPhone} />
            {etichettaTavoli(p.tableNumbers) && (
              <Riga voce="Posto" valore={etichettaTavoli(p.tableNumbers)!} />
            )}
            {p.notes && <Riga voce="Note" valore={p.notes} />}
          </div>
        </section>

        {/* Spostamento proposto: la risposta del cliente e' la cosa che questa
            pagina deve chiedere, quindi sta prima di tutto il resto e ha due
            pulsanti veri — accettare in silenzio non e' accettare. */}
        {stato === "proposed" && (
          <section
            className="card mt-4 p-4"
            style={{ borderColor: "var(--warn)", background: "var(--warn-bg)" }}
          >
            <div className="text-sm font-medium">
              Il locale ha spostato la prenotazione
            </div>
            <p className="mt-1 text-sm">
              {p.previousStartsAt ? (
                <>
                  Avevi chiesto{" "}
                  <strong>
                    {p.previousStartsAt.toLocaleString("it-IT", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </strong>
                  : possiamo tenerti il tavolo alle <strong>{ora}</strong>.
                </>
              ) : (
                <>Il tavolo ti viene tenuto alle <strong>{ora}</strong>.</>
              )}{" "}
              Ci serve un tuo cenno.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <form action={accettaSpostamento}>
                <input type="hidden" name="token" value={token} />
                <button className="btn btn-primary btn-sm">
                  Va bene, accetto
                </button>
              </form>
              <form action={annullaDalModulo}>
                <input type="hidden" name="token" value={token} />
                <ConfirmSubmit
                  label="Non mi va bene"
                  confirmLabel="Sì, annulla il tavolo"
                  ariaLabel="Rifiuta il nuovo orario e annulla la prenotazione"
                />
              </form>
            </div>
          </section>
        )}

        {stato === "pending" && (
          <p className="pr-avviso mt-4">
            Il locale deve ancora confermare: il tavolo è tenuto da parte
            intanto. Se non ricevi notizie entro qualche ora, una telefonata
            risolve prima di qualsiasi attesa.
          </p>
        )}
        {stato === "cancelled" && (
          <p className="pr-avviso mt-4">
            Questa prenotazione è annullata. Per rifarla, torna alla pagina di
            prenotazione: il tavolo che avevi è di nuovo libero per tutti.
          </p>
        )}
        {ctx.cfg.nota && stato !== "cancelled" && (
          <p className="pr-avviso mt-4">{ctx.cfg.nota}</p>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <a href="/prenota" className="btn btn-sm">
            {stato === "cancelled" ? "Prenota di nuovo" : "Nuova prenotazione"}
          </a>

          {disdicibile && stato !== "proposed" && (
            <form action={annullaDalModulo}>
              <input type="hidden" name="token" value={token} />
              <ConfirmSubmit
                label="Disdici il tavolo"
                confirmLabel="Sì, disdici"
                ariaLabel="Disdici questa prenotazione"
              />
            </form>
          )}
        </div>

        <p className="mt-6 text-xs" style={{ color: "var(--muted)" }}>
          {ctx.mailAttiva
            ? "Questo indirizzo è anche nella mail che ti abbiamo mandato: da qui rivedi o disdici la prenotazione senza chiamare."
            : "Salva questo indirizzo: è l'unico modo per rivedere o disdire la prenotazione senza chiamare."}
        </p>

        <footer
          className="mt-12 border-t pt-6 text-center text-xs"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
        >
          <div className="font-medium" style={{ color: "var(--text)" }}>
            {ctx.nome}
          </div>
          {ctx.indirizzo && <div className="mt-1">{ctx.indirizzo}</div>}
          {ctx.telefono && (
            <div className="mt-1">
              <a href={`tel:${ctx.telefono}`} className="underline">
                {ctx.telefono}
              </a>
            </div>
          )}
        </footer>
      </div>
    </main>
  );
}
