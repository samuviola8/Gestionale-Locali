import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  contestoPrenotazione,
  dataISO,
  giorniPrenotabili,
} from "@/lib/prenotazioni";
import ModuloPrenotazione, {
  type GiornoScelta,
} from "@/components/prenota/ModuloPrenotazione";
import { STILE_PRENOTA } from "@/components/prenota/stile";

// Prenotazione di un tavolo dal sito del locale. E' una pagina pubblica: ci si
// arriva da Google o dal link nella bio, senza QR e senza sessione al tavolo.
// Fuori dai locali che hanno il modulo acceso non esiste, e risponde 404 come
// qualsiasi indirizzo inventato.

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await contestoPrenotazione();
  if (!ctx) return { title: "Pagina non trovata" };
  return {
    title: `Prenota un tavolo — ${ctx.nome}`,
    description: `Prenota un tavolo da ${ctx.nome}: scegli quante persone siete, il giorno e l'ora. Senza chiamare e senza scaricare niente.`,
  };
}

function scelteGiorno(giorni: Date[], adesso: Date): GiornoScelta[] {
  return giorni.map((d) => {
    const diff = Math.round(
      (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
        new Date(
          adesso.getFullYear(),
          adesso.getMonth(),
          adesso.getDate()
        ).getTime()) /
        86400000
    );
    return {
      iso: dataISO(d),
      nome:
        diff === 0
          ? "Oggi"
          : diff === 1
            ? "Domani"
            : d.toLocaleDateString("it-IT", { weekday: "short" }),
      numero: String(d.getDate()),
      mese: d.toLocaleDateString("it-IT", { month: "short" }).replace(".", ""),
    };
  });
}

export default async function PrenotaPage() {
  const ctx = await contestoPrenotazione();
  if (!ctx) notFound();

  const adesso = new Date();
  const giorni = scelteGiorno(
    giorniPrenotabili(ctx.orari, adesso, ctx.cfg),
    adesso
  );
  const ultimo = new Date(
    adesso.getFullYear(),
    adesso.getMonth(),
    adesso.getDate() + ctx.cfg.giorniAvanti
  );

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

          <div className="pr-occhiello mt-6">Prenotazione</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Prenota un tavolo
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm" style={{ color: "var(--muted)" }}>
            Tre tocchi: quante siete, quando, a che ora. Gli orari che vedi sono
            quelli con un tavolo davvero libero.
          </p>
        </header>

        <ModuloPrenotazione
          giorni={giorni}
          minPersone={ctx.cfg.minPersone}
          maxPersone={ctx.cfg.maxPersone}
          confermaAutomatica={ctx.cfg.confermaAutomatica}
          nota={ctx.cfg.nota}
          telefono={ctx.telefono}
          ultimoGiorno={dataISO(ultimo)}
          giorniAvanti={ctx.cfg.giorniAvanti}
          emailObbligatoria={ctx.mailAttiva}
        />

        <footer
          className="mt-14 border-t pt-6 text-center text-xs"
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
