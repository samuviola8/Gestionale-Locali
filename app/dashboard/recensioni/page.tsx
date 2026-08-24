import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { getChannel } from "@/lib/channels";
import {
  dovePorta,
  recensioniDelLocale,
  riassuntoRecensioni,
  segnaLette,
} from "@/lib/recensioni";
import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Le recensioni dei clienti, viste dal locale.
//
// Restano qui: non le pubblica nessuno. Servono a sapere che la carbonara di
// venerdi' non andava *prima* che quella frase finisca su Google — e a quel
// punto una telefonata vale piu' di una risposta pubblica.
//
// Aprendo la pagina si segnano lette: e' un promemoria, non un archivio da
// tenere in ordine.

function quando(d: Date): string {
  return d.toLocaleString("it-IT", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Stelle({ voto }: { voto: number }) {
  return (
    <span
      className="tnum"
      style={{ color: voto >= 4 ? "#f0a500" : "var(--muted)" }}
      aria-label={`${voto} su 5`}
    >
      {"★".repeat(voto)}
      <span style={{ opacity: 0.25 }}>{"★".repeat(5 - voto)}</span>
    </span>
  );
}

export default async function RecensioniPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login");

  const [locale] = await db
    .select({
      acceso: tenants.reviewsEnabled,
      url: tenants.reviewUrl,
    })
    .from(tenants)
    .where(eq(tenants.id, session.tenantId))
    .limit(1);

  const riassunto = await riassuntoRecensioni(session.tenantId);
  const righe = await recensioniDelLocale(session.tenantId);
  // Guardate: il pallino si spegne. Il testo resta dov'e'.
  if (riassunto.daLeggere) await segnaLette(session.tenantId);

  const dove = dovePorta(locale?.url ?? null);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Recensioni</h1>
        <p className="mt-0.5 text-sm" style={{ color: "var(--muted)" }}>
          Quello che i vostri clienti hanno risposto a cose fatte. Le leggete
          solo voi.
        </p>
      </div>

      {!locale?.acceso && (
        <div className="card p-4">
          <p className="text-sm">
            La domanda è spenta: al momento a nessuno viene chiesto niente.
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            Si accende in{" "}
            <Link href="/dashboard/impostazioni" className="underline">
              Impostazioni → Com&apos;è andata
            </Link>
            , insieme al link del vostro profilo pubblico.
          </p>
        </div>
      )}

      {riassunto.quante > 0 && (
        <div className="card flex flex-wrap items-baseline gap-x-6 gap-y-2 p-4">
          <div>
            <div className="text-2xl font-semibold tnum">
              {riassunto.media.toFixed(1)}
            </div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              media su {riassunto.quante}{" "}
              {riassunto.quante === 1 ? "risposta" : "risposte"}
            </div>
          </div>
          {dove && locale?.url && (
            <a
              href={locale.url}
              target="_blank"
              rel="noreferrer"
              className="text-sm underline"
              style={{ color: "var(--muted)" }}
            >
              Il vostro profilo su {dove}
            </a>
          )}
        </div>
      )}

      {righe.length === 0 ? (
        <div className="card p-4 text-sm" style={{ color: "var(--muted)" }}>
          Ancora nessuna risposta. Arrivano da chi ordina dal sito quando
          l&apos;ordine è chiuso, e dal tavolo dopo l&apos;invio.
        </div>
      ) : (
        <ul className="space-y-2">
          {righe.map((r) => (
            <li key={r.id} className="card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Stelle voto={r.voto} />
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  {getChannel(r.canale).label} · {quando(r.quando)}
                  {r.nome ? ` · ${r.nome}` : ""}
                </span>
              </div>
              {r.testo && <p className="mt-2 text-sm">«{r.testo}»</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
