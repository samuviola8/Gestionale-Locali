import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import {
  canaleDi,
  contestoOrdineWeb,
  giorniOrdinabili,
  type ImpostazioniCanale,
} from "@/lib/ordini-web";
import { getMenu, perCanali } from "@/lib/menu";
import { raggioMassimo } from "@/lib/consegna";
import { getChannel, type Channel } from "@/lib/channels";
import { pilloleGiorni, type GiornoScelta } from "@/lib/format";
import ModuloOrdine from "@/components/ordina/ModuloOrdine";
import { STILE_PRENOTA } from "@/components/prenota/stile";
import { STILE_ORDINA } from "@/components/ordina/stile";

// Asporto e domicilio dal sito del locale. Come la prenotazione e' una pagina
// pubblica — ci si arriva da Google o dal link nella bio, senza QR e senza
// sessione — e fuori dai locali che l'hanno accesa non esiste: risponde 404
// come qualsiasi indirizzo inventato.

// Il menu si sfoglia col pollice: la pizzicata che ingrandisce lascerebbe le
// righe storte a meta' schermo, come sulla pagina del tavolo.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await contestoOrdineWeb();
  if (!ctx) return { title: "Pagina non trovata" };

  const cosa = ctx.canali.map((c) => getChannel(c).label.toLowerCase());
  return {
    title: `Ordina ${cosa.join(" e ")} — ${ctx.nome}`,
    description: `Ordina da ${ctx.nome}: scegli dal menu, scegli l'ora e passa a ritirare. Senza chiamare e senza scaricare niente.`,
  };
}

export default async function OrdinaPage() {
  const ctx = await contestoOrdineWeb();
  if (!ctx) notFound();

  const menu = perCanali(await getMenu(ctx.tenantId), ctx.canali);
  const adesso = new Date();

  // I giorni si calcolano per canale: il domicilio ha il preavviso piu' lungo,
  // e un venerdi' che per il ritiro e' ancora buono per la consegna puo' non
  // esserlo piu'.
  const giorni = {} as Record<Channel, GiornoScelta[]>;
  const regole = {} as Record<Channel, ImpostazioniCanale>;
  for (const canale of ctx.canali) {
    giorni[canale] = pilloleGiorni(
      giorniOrdinabili(ctx.orari, adesso, ctx.cfg, canale),
      adesso
    );
    // Nota, minimo d'ordine, giorni in avanti e accettazione: ogni canale ha i
    // suoi, e la pagina cambia parole quando il cliente cambia canale.
    regole[canale] = canaleDi(ctx.cfg, canale);
  }

  return (
    <main className="pr">
      <style dangerouslySetInnerHTML={{ __html: STILE_PRENOTA + STILE_ORDINA }} />

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

          <div className="pr-occhiello mt-6">Ordina</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {ctx.canali.length === 1
              ? ctx.canali[0] === "asporto"
                ? "Ordina e passa a ritirare"
                : "Ordina, te la portiamo a casa"
              : "Ritiro o consegna"}
          </h1>
          <p
            className="mx-auto mt-3 max-w-sm text-sm"
            style={{ color: "var(--muted)" }}
          >
            Scegli dal menu, poi l&apos;ora. Gli orari che vedi sono quelli in
            cui la cucina ce la fa davvero.
          </p>
        </header>

        {ctx.sospesoFino ? (
          <div className="pr-avviso mt-8">
            <strong>Stasera non prendiamo altri ordini dal sito.</strong> La
            cucina è al completo: gli ordini riaprono domani.
            {ctx.telefono && (
              <>
                {" "}
                Se ti serve lo stesso, prova a chiamare il{" "}
                <a href={`tel:${ctx.telefono}`} className="underline">
                  {ctx.telefono}
                </a>
                .
              </>
            )}
          </div>
        ) : menu.length === 0 ? (
          <div className="pr-avviso mt-8">
            Il menu online è momentaneamente vuoto.
            {ctx.telefono && (
              <>
                {" "}
                Per ordinare chiama il{" "}
                <a href={`tel:${ctx.telefono}`} className="underline">
                  {ctx.telefono}
                </a>
                .
              </>
            )}
          </div>
        ) : (
          <ModuloOrdine
            canali={ctx.canali}
            menu={menu}
            giorni={giorni}
            regole={regole}
            telefono={ctx.telefono}
            raggioKm={raggioMassimo(ctx.fasce)}
            gratisSopraCents={ctx.gratisSopraCents}
            emailObbligatoria={ctx.mailAttiva}
          />
        )}

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
