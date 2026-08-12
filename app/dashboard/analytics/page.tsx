import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getAnalytics, type VoceClassifica } from "@/lib/analytics";
import { formatPrice as fmt } from "@/lib/format";
import PeriodoFiltro from "@/components/PeriodoFiltro";

// Estremi del periodo. Si lavora a mezzanotte locale: un intervallo che parte
// a meta' giornata darebbe confronti tra giorni non confrontabili.
function mezzanotte(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function leggiPeriodo(p?: string, da?: string, a?: string) {
  const oggi = mezzanotte(new Date());
  const domani = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() + 1);

  if (da && a) {
    const d = new Date(da + "T00:00:00");
    const fine = new Date(a + "T00:00:00");
    if (!Number.isNaN(+d) && !Number.isNaN(+fine) && d <= fine) {
      const dopo = new Date(fine.getFullYear(), fine.getMonth(), fine.getDate() + 1);
      return { da: d, a: dopo, preset: "" };
    }
  }

  const giorni = p === "oggi" ? 1 : p === "30" ? 30 : p === "90" ? 90 : 7;
  const inizio = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() - giorni + 1);
  return { da: inizio, a: domani, preset: p ?? "7" };
}

function Kpi({
  etichetta,
  valore,
  sotto,
}: {
  etichetta: string;
  valore: string;
  sotto?: string;
}) {
  return (
    <div className="card p-4">
      <div className="text-xs" style={{ color: "var(--muted)" }}>
        {etichetta}
      </div>
      <div className="tnum mt-1 text-2xl font-semibold">{valore}</div>
      {sotto && (
        <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
          {sotto}
        </div>
      )}
    </div>
  );
}

// Barre in CSS invece di una libreria di grafici: la pagina resta leggera e
// non c'e' niente da caricare da fuori.
function Barre({
  titolo,
  sottotitolo,
  dati,
  vuoto,
}: {
  titolo: string;
  sottotitolo?: string;
  dati: { etichetta: string; valore: number; nota: string }[];
  vuoto: string;
}) {
  const max = Math.max(1, ...dati.map((d) => d.valore));
  const nessunDato = dati.every((d) => d.valore === 0);

  return (
    <div className="card p-4">
      <div className="text-sm font-medium">{titolo}</div>
      {sottotitolo && (
        <div className="text-xs" style={{ color: "var(--muted)" }}>
          {sottotitolo}
        </div>
      )}
      {nessunDato ? (
        <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
          {vuoto}
        </p>
      ) : (
        <div className="mt-3 space-y-1.5">
          {dati.map((d) => (
            <div key={d.etichetta} className="flex items-center gap-2 text-xs">
              <span className="w-16 shrink-0" style={{ color: "var(--muted)" }}>
                {d.etichetta}
              </span>
              <span
                className="h-4 min-w-[2px] rounded-sm"
                style={{
                  width: `${Math.round((d.valore / max) * 100)}%`,
                  background:
                    d.valore === max ? "var(--brand)" : "var(--brand-50)",
                }}
              />
              <span className="tnum shrink-0" style={{ color: "var(--muted)" }}>
                {d.nota}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Classifica({
  titolo,
  sottotitolo,
  voci,
  vuoto,
}: {
  titolo: string;
  sottotitolo?: string;
  voci: VoceClassifica[];
  vuoto: string;
}) {
  const max = Math.max(1, ...voci.map((v) => v.incassoCents));

  return (
    <div className="card p-4">
      <div className="text-sm font-medium">{titolo}</div>
      {sottotitolo && (
        <div className="text-xs" style={{ color: "var(--muted)" }}>
          {sottotitolo}
        </div>
      )}
      {voci.length === 0 ? (
        <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
          {vuoto}
        </p>
      ) : (
        <ol className="mt-3 space-y-2">
          {voci.map((v, i) => (
            <li key={v.nome}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  <span className="tnum mr-1.5" style={{ color: "var(--muted)" }}>
                    {i + 1}.
                  </span>
                  {v.nome}
                </span>
                <span className="tnum shrink-0 font-medium">
                  {fmt(v.incassoCents)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span
                  className="h-1.5 min-w-[2px] rounded-full"
                  style={{
                    width: `${Math.round((v.incassoCents / max) * 100)}%`,
                    background: "var(--brand)",
                  }}
                />
                <span className="tnum text-xs" style={{ color: "var(--muted)" }}>
                  {v.pezzi} {v.pezzi === 1 ? "pezzo" : "pezzi"}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; da?: string; a?: string }>;
}) {
  const session = await getSessionUser();
  if (!session) redirect("/login");

  const { p, da, a } = await searchParams;
  const periodo = leggiPeriodo(p, da, a);
  const dati = await getAnalytics(session.tenantId, periodo);

  // L'ultimo giorno mostrato e' quello prima della fine esclusiva.
  const ultimo = new Date(periodo.a.getTime() - 1);
  const giorniPeriodo = dati.perGiorno.length;
  const inSospeso = dati.incassoCents - dati.incassatoCents;

  const nomeGiorno = (g: string) => {
    const d = new Date(g + "T00:00:00");
    return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="mt-0.5 text-sm" style={{ color: "var(--muted)" }}>
          Dal {periodo.da.toLocaleDateString("it-IT")} al{" "}
          {ultimo.toLocaleDateString("it-IT")}. Il periodo è quello in cui è
          stato ordinato.
        </p>
      </div>

      <PeriodoFiltro
        attivo={periodo.preset}
        da={iso(periodo.da)}
        a={iso(ultimo)}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          etichetta="Incasso"
          valore={fmt(dati.incassoCents)}
          sotto={
            inSospeso > 0
              ? `${fmt(inSospeso)} ancora su tavoli aperti`
              : "tutto saldato"
          }
        />
        <Kpi
          etichetta="Scontrino medio"
          valore={dati.coperti > 0 ? fmt(dati.scontrinoMedioCents) : "—"}
          sotto={
            dati.coperti > 0
              ? "a persona seduta, sui tavoli chiusi"
              : "serve almeno un tavolo chiuso"
          }
        />
        <Kpi
          etichetta="Ordini"
          valore={String(dati.ordini)}
          sotto={`${dati.pezzi} ${dati.pezzi === 1 ? "pezzo" : "pezzi"} in tutto`}
        />
        <Kpi
          etichetta="Coperti"
          valore={String(dati.coperti)}
          sotto={
            dati.tavoliChiusi > 0
              ? `${dati.tavoliChiusi} ${dati.tavoliChiusi === 1 ? "tavolo chiuso" : "tavoli chiusi"}${dati.copertoCents > 0 ? `, ${fmt(dati.copertoCents)} di coperto` : ""}`
              : "nessun tavolo chiuso nel periodo"
          }
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Barre
          titolo="Andamento"
          sottotitolo={`Incasso per giorno, ${giorniPeriodo} ${giorniPeriodo === 1 ? "giorno" : "giorni"}`}
          dati={dati.perGiorno.map((g) => ({
            etichetta: nomeGiorno(g.giorno),
            valore: g.incassoCents,
            nota: g.incassoCents > 0 ? fmt(g.incassoCents) : "—",
          }))}
          vuoto="Nessun ordine in questo periodo."
        />

        <Barre
          titolo="Fasce orarie"
          sottotitolo="Quando si ordina davvero: serve per i turni"
          dati={dati.perOra.map((o) => ({
            etichetta: `${String(o.ora).padStart(2, "0")}:00`,
            valore: o.incassoCents,
            nota: `${o.ordini} ${o.ordini === 1 ? "ordine" : "ordini"}`,
          }))}
          vuoto="Nessun ordine in questo periodo."
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Classifica
          titolo="Cosa si vende"
          sottotitolo="I dieci prodotti che portano più incasso"
          voci={dati.topProdotti}
          vuoto="Nessuna consumazione nel periodo."
        />
        <Classifica
          titolo="Per categoria"
          voci={dati.topCategorie}
          vuoto="Nessuna consumazione nel periodo."
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Classifica
          titolo="Cosa è finito"
          sottotitolo="Voci annullate: se una torna spesso, conviene ordinarne di più"
          voci={dati.annullati}
          vuoto="Niente annullato nel periodo."
        />

        <div className="card p-4">
          <div className="text-sm font-medium">Cosa chiedono i clienti</div>
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            Richieste e note scritte al tavolo: dicono cosa manca a menu
          </div>
          {dati.richieste.length === 0 ? (
            <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
              Nessuna richiesta scritta nel periodo.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {dati.richieste.map((r, i) => (
                <li key={i} className="text-sm">
                  <div className="italic">«{r.testo}»</div>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>
                    {r.prodotto} ·{" "}
                    {r.quando.toLocaleDateString("it-IT", {
                      day: "numeric",
                      month: "short",
                    })}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
