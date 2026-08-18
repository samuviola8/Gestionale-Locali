import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { requireModule } from "@/lib/module-guard";
import { contaClienti, elencoClienti } from "@/lib/rubrica";
import SchedaCliente from "./SchedaCliente";
import RigaCliente from "./RigaCliente";
import ImportaRubrica from "./ImportaRubrica";

// La rubrica del locale: l'agenda accanto al telefono, che alla cassa si
// compila da sola scrivendo il nome. Qui la si sistema — si aggiunge chi ha
// ordinato una volta sola a voce, si corregge un indirizzo cambiato, si porta
// dentro quella che il locale aveva gia' su un foglio Excel.

// Oltre questa soglia non si scorre piu': si cerca. L'elenco intero di una
// rubrica da migliaia di schede non lo legge nessuno, e caricarlo tutto
// renderebbe lenta la pagina proprio a chi ha piu' clienti.
const LIMITE = 200;

function quando(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function RubricaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string }>;
}) {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  await requireModule("customers");

  const { q = "", tab } = await searchParams;
  const suImporta = tab === "importa";

  const [clienti, totale] = await Promise.all([
    suImporta
      ? Promise.resolve([])
      : elencoClienti(session.tenantId, q, LIMITE),
    contaClienti(session.tenantId),
  ]);

  const schede: { chiave: string; etichetta: string; href: string }[] = [
    { chiave: "clienti", etichetta: "Clienti", href: "/dashboard/rubrica" },
    {
      chiave: "importa",
      etichetta: "Importa",
      href: "/dashboard/rubrica?tab=importa",
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Rubrica</h1>
        <p className="mt-0.5 text-sm" style={{ color: "var(--muted)" }}>
          {totale === 0
            ? "Nessun cliente. Si riempie da sola battendo gli ordini, o si importa qui."
            : `${totale} ${totale === 1 ? "cliente" : "clienti"} · alla cassa basta scrivere il nome.`}
        </p>
      </div>

      <div className="flex gap-2">
        {schede.map((s) => {
          const attiva = (s.chiave === "importa") === suImporta;
          return (
            <Link
              key={s.chiave}
              href={s.href}
              aria-current={attiva}
              className="flex min-h-9 items-center rounded-full px-4 text-sm"
              style={
                attiva
                  ? { background: "var(--brand)", color: "var(--brand-on)" }
                  : { background: "var(--surface-2)", color: "var(--muted)" }
              }
            >
              {s.etichetta}
            </Link>
          );
        })}
      </div>

      {suImporta ? (
        <ImportaRubrica />
      ) : (
        <>
          <details className="disclosure">
            <summary>Aggiungi un cliente</summary>
            <div className="disclosure-body">
              <SchedaCliente />
            </div>
          </details>

          {/* Modulo GET normale: la ricerca resta nell'indirizzo, e la pagina
              di un cliente cercato si puo' ricaricare o tenere aperta. */}
          <form className="flex gap-2">
            <input
              name="q"
              defaultValue={q}
              placeholder="Cerca per nome, telefono o indirizzo…"
              aria-label="Cerca in rubrica"
              className="input h-10 flex-1"
            />
            <button className="btn">Cerca</button>
            {q && (
              <Link href="/dashboard/rubrica" className="btn">
                Azzera
              </Link>
            )}
          </form>

          {clienti.length === 0 ? (
            <div
              className="card p-8 text-center text-sm"
              style={{ color: "var(--muted)" }}
            >
              {q
                ? "Nessun cliente con questo nome."
                : "La rubrica è vuota."}
            </div>
          ) : (
            <div className="space-y-2">
              {clienti.map((c) => (
                <RigaCliente
                  key={c.id}
                  cliente={c}
                  ultimoOrdine={quando(c.ultimoOrdine)}
                />
              ))}
            </div>
          )}

          {clienti.length === LIMITE && (
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Mostrati i primi {LIMITE}. Per gli altri usa la ricerca.
            </p>
          )}
        </>
      )}
    </div>
  );
}
