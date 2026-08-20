import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { requireAnyModule } from "@/lib/module-guard";
import { getTenantModules } from "@/lib/modules";
import { statoSala } from "@/lib/sala";
import PiantaSala, { type TavoloVista } from "@/components/PiantaSala";
import {
  apriTavolo,
  liberaTavolo,
  segnaPersone,
  separaTavoli,
  spostaConto,
  unisciTavoli,
} from "./actions";

// La sala durante il servizio.
//
// Le altre pagine guardano il lavoro: la coda quello che manca da preparare, i
// conti quello che manca da incassare. Questa guarda i tavoli, e risponde alle
// due domande che durante il servizio si fanno a voce da una parte all'altra
// della sala: «il sei e' libero?» e «quelli da quanto sono li'?».

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

export default async function SalaPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  // Serve dove ci sono tavoli da tenere: col QR, con le prenotazioni, o con
  // tutti e due.
  await requireAnyModule(["qr_ordering", "reservations"]);

  const modules = await getTenantModules(session.tenantId);
  const sala = await statoSala(session.tenantId, modules);

  // Le date vanno al client come stringhe: i minuti seduti li conta il
  // browser, che e' l'unico posto dove l'orologio va avanti da solo.
  const tavoli: TavoloVista[] = sala.tavoli.map((t) => ({
    numero: t.numero,
    posti: t.posti,
    gruppo: t.gruppo
      ? {
          capofila: t.gruppo.capofila,
          tavoli: t.gruppo.tavoli,
          da: t.gruppo.da ? t.gruppo.da.toISOString() : null,
          origine: t.gruppo.origine,
          persone: t.gruppo.persone,
          totaleCents: t.gruppo.totaleCents,
          daIncassareCents: t.gruppo.daIncassareCents,
          contoKey: t.gruppo.contoKey,
          inPreparazione: t.gruppo.inPreparazione,
          chiamata: t.gruppo.chiamata,
          daPrenotazione: t.gruppo.daPrenotazione,
        }
      : null,
    prossimo: t.prossimo
      ? {
          alle: t.prossimo.alle.toISOString(),
          nome: t.prossimo.nome,
          persone: t.prossimo.persone,
        }
      : null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Sala</h1>
        <p className="mt-0.5 text-sm" style={{ color: "var(--muted)" }}>
          {sala.tavoli.length === 0
            ? "Nessun tavolo ancora."
            : "Tocca un tavolo per aprirlo, liberarlo o accostarlo a un altro."}
        </p>
      </div>

      {sala.tavoli.length === 0 ? (
        <div className="card px-6 py-14 text-center">
          <div className="text-base font-medium">La sala è vuota</div>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Crea i tavoli e torna qui: da questa pagina si vede chi è seduto e
            da quanto.
          </p>
          <Link href="/dashboard/tables" className="btn btn-primary btn-sm mt-4">
            Vai ai tavoli
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Tavoli occupati" value={sala.occupati} />
            <Stat label="Liberi" value={sala.liberi} />
            <Stat label="Persone sedute" value={sala.copertiSeduti} />
          </div>

          <PiantaSala
            tavoli={tavoli}
            copertiSeduti={sala.copertiSeduti}
            splitBill={modules.split_bill}
            qrOrdering={modules.qr_ordering}
            unisciTavoli={unisciTavoli}
            apriTavolo={apriTavolo}
            spostaConto={spostaConto}
            separaTavoli={separaTavoli}
            liberaTavolo={liberaTavolo}
            segnaPersone={segnaPersone}
          />
        </>
      )}
    </div>
  );
}
