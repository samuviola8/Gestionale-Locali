import { richiediAdmin } from "@/lib/admin-auth";
import {
  STATI,
  badgeStato,
  etichettaStato,
  etichettaTipo,
} from "@/lib/segnalazioni";
import {
  segnalazioniPerAdmin,
  type FiltroSegnalazioni,
} from "@/lib/segnalazioni-query";
import { salvaRisposta } from "./actions";

// Dove rispondo alle segnalazioni dello staff. L'avviso su Telegram serve a
// sapere che e' arrivata; questa pagina e' quella che tiene il conto di quelle
// a cui non ho ancora risposto.

const FILTRI: { key: FiltroSegnalazioni; label: string }[] = [
  { key: "aperte", label: "Da vedere" },
  { key: "risolte", label: "Risolte" },
  { key: "tutte", label: "Tutte" },
];

function quando(d: Date): string {
  return d.toLocaleString("it-IT", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Il nome del browser, non la stringa intera: quella e' lunga tre righe e
// dentro c'e' scritto tutto tranne quello che serve.
function dispositivo(ua: string | null): string {
  if (!ua) return "";
  const sistema = /Android/i.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/i.test(ua)
      ? "iOS"
      : /Windows/i.test(ua)
        ? "Windows"
        : /Mac OS X/i.test(ua)
          ? "Mac"
          : /Linux/i.test(ua)
            ? "Linux"
            : "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "";
  return [sistema, browser].filter(Boolean).join(" · ");
}

export default async function SegnalazioniAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ stato?: string }>;
}) {
  await richiediAdmin();

  const { stato } = await searchParams;
  const filtro: FiltroSegnalazioni = FILTRI.some((f) => f.key === stato)
    ? (stato as FiltroSegnalazioni)
    : "aperte";

  const righe = await segnalazioniPerAdmin(filtro);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <main className="mx-auto max-w-3xl space-y-5 px-6 py-8">
        <div>
          <a
            href="/admin"
            className="text-sm text-neutral-500 hover:text-neutral-800"
          >
            ← Torna alla panoramica
          </a>
          <h1 className="mt-2 text-2xl font-semibold">Segnalazioni</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Quello che lo staff dei locali scrive dal pannello in fondo alla
            barra. La risposta torna li' dentro, dove lavorano.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTRI.map((f) => (
            <a
              key={f.key}
              href={`/admin/segnalazioni?stato=${f.key}`}
              className="btn btn-sm"
              style={
                f.key === filtro
                  ? {
                      background: "var(--brand-50)",
                      borderColor: "var(--brand)",
                      color: "var(--brand-text)",
                    }
                  : undefined
              }
            >
              {f.label}
            </a>
          ))}
        </div>

        {righe.length === 0 && (
          <div className="card px-4 py-10 text-center">
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Niente da leggere.
            </p>
          </div>
        )}

        {righe.map((s) => (
          <article key={s.id} className="card space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`badge ${badgeStato(s.status)}`}>
                {etichettaStato(s.status)}
              </span>
              <a
                href={`/admin/locali/${s.tenantId}`}
                className="text-sm font-medium hover:underline"
              >
                {s.tenantName}
              </a>
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {etichettaTipo(s.kind)} · {quando(s.createdAt)} · {s.autore}
              </span>
            </div>

            <p className="whitespace-pre-wrap text-sm">{s.message}</p>

            {(s.page || s.userAgent) && (
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                {[s.page, dispositivo(s.userAgent)].filter(Boolean).join(" · ")}
              </p>
            )}

            {s.reply && (
              <div
                className="pl-3"
                style={{ borderLeft: "2px solid var(--brand)" }}
              >
                <div
                  className="text-[11px] font-medium"
                  style={{ color: "var(--brand-text)" }}
                >
                  Risposta{s.repliedAt ? ` · ${quando(s.repliedAt)}` : ""}
                  {s.reply && !s.replySeenAt ? " · non ancora letta" : ""}
                </div>
                <p className="mt-0.5 whitespace-pre-wrap text-sm">{s.reply}</p>
              </div>
            )}

            <form action={salvaRisposta} className="space-y-2">
              <input type="hidden" name="id" value={s.id} />
              <textarea
                name="risposta"
                rows={2}
                className="input py-2.5"
                style={{ minHeight: "64px", resize: "vertical" }}
                placeholder={
                  s.reply ? "Aggiorna la risposta…" : "Rispondi allo staff…"
                }
                defaultValue={s.reply ?? ""}
              />
              <div className="flex flex-wrap items-center gap-2">
                <select
                  name="stato"
                  className="input"
                  style={{ width: "auto" }}
                  defaultValue={s.status}
                >
                  {STATI.map((st) => (
                    <option key={st.key} value={st.key}>
                      {st.label}
                    </option>
                  ))}
                </select>
                <button className="btn btn-primary btn-sm">Salva</button>
              </div>
            </form>
          </article>
        ))}
      </main>
    </div>
  );
}
