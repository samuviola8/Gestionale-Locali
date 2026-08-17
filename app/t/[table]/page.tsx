import { notFound, redirect } from "next/navigation";
import { getTenantFromHost } from "@/lib/tenant-host";
import { getMenu } from "@/lib/menu";
import { getTableSession } from "@/lib/table-session";
import { getTenantModules } from "@/lib/modules";
import OrderClient from "@/components/OrderClient";
import TableStatus from "@/components/TableStatus";
import ThemeToggle from "@/components/ThemeToggle";
import GuidaTavolo from "@/components/GuidaTavolo";
import { createOrder, callWaiter } from "./order-actions";

function Avviso({
  titolo,
  testo,
  nome,
}: {
  titolo: string;
  testo: string;
  nome: string;
}) {
  return (
    <main className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="text-xl font-medium">{nome}</h1>
      <p className="mt-4 text-lg">{titolo}</p>
      <p className="mt-2 text-neutral-500">{testo}</p>
    </main>
  );
}

export default async function TablePage({
  params,
  searchParams,
}: {
  params: Promise<{ table: string }>;
  searchParams: Promise<{ k?: string; errore?: string }>;
}) {
  const { table } = await params;
  const { k, errore } = await searchParams;
  const t = await getTenantFromHost();
  if (!t) notFound();

  // QR della vecchia generazione (token direttamente sulla pagina): li mando
  // sull'endpoint di apertura, cosi' i codici gia' stampati restano validi.
  if (k) redirect(`/t/${table}/apri?k=${encodeURIComponent(k)}`);

  if (t.suspended) {
    return (
      <Avviso
        nome={t.name}
        titolo="Ordinazioni non disponibili"
        testo="Il servizio è momentaneamente sospeso."
      />
    );
  }

  const tableNumber = parseInt(table, 10) || 0;
  const session = await getTableSession(t.id);

  if (!session || session.tableNumber !== tableNumber) {
    return (
      <Avviso
        nome={t.name}
        titolo={
          errore === "qr" ? "Codice non valido" : "Sessione scaduta"
        }
        testo={
          errore === "qr"
            ? "Il QR non corrisponde a nessun tavolo di questo locale. Chiedi aiuto al personale."
            : "Per ordinare, inquadra di nuovo il QR code sul tavolo."
        }
      />
    );
  }

  const modules = await getTenantModules(t.id);
  if (!modules.qr_ordering) {
    return (
      <Avviso
        nome={t.name}
        titolo="Ordinazione da QR non attiva"
        testo="In questo locale l'ordine si fa al banco o tramite il personale."
      />
    );
  }

  const menu = await getMenu(t.id);

  return (
    <main className="mx-auto max-w-md px-4 py-5 pb-28">
      <div className="mb-3 flex items-center justify-between gap-2">
        <GuidaTavolo
          tenantId={t.id}
          tableNumber={tableNumber}
          splitBill={modules.split_bill}
          waiterCall={modules.waiter_call}
          coverChargeCents={t.coverChargeCents}
          sessionMinutes={t.tableSessionMinutes}
        />
        <ThemeToggle />
      </div>
      <OrderClient
        tenantName={t.name}
        logoUrl={t.logoUrl}
        menu={menu}
        tableNumber={tableNumber}
        skinKey={t.menuSkin}
        splitBill={modules.split_bill}
        waiterCall={modules.waiter_call}
        submitOrder={createOrder}
        callWaiter={callWaiter}
      />
      <TableStatus tableNumber={tableNumber} splitBill={modules.split_bill} />
    </main>
  );
}
