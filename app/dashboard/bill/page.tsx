import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { requireModule } from "@/lib/module-guard";
import { getTenantModules } from "@/lib/modules";
import { getMenu } from "@/lib/menu";
import { CHANNELS } from "@/lib/channels";
import BillBoard from "@/components/BillBoard";
import {
  aggiungiAlConto,
  markAliasPaid,
  closeTable,
  setPartySize,
  spostaVoce,
  stampaConto,
} from "./actions";
import { cambiaNotaVoce, voidOrderItem } from "../orders/actions";

export default async function BillPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  await requireModule("split_bill");

  const modules = await getTenantModules(session.tenantId);

  // I canali che questo locale ha davvero: sono le pillole del filtro, le
  // stesse della coda ordini. La sala c'e' se c'e' il QR o il cameriere.
  const canali = CHANNELS.filter((c) =>
    c.module ? modules[c.module] : modules.qr_ordering
  ).map((c) => c.key);

  // Il menu serve per aggiungere una consumazione a un conto gia' aperto: il
  // cliente richiama, e chi risponde deve poterla battere da qui invece di
  // aprirgli un secondo ordine da incassare a parte.
  const menu = await getMenu(session.tenantId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Conti aperti</h1>
        <p className="mt-0.5 text-sm" style={{ color: "var(--muted)" }}>
          Incassa per singola persona, poi chiudi il tavolo.
        </p>
      </div>
      <BillBoard
        markAliasPaid={markAliasPaid}
        closeTable={closeTable}
        setPartySize={setPartySize}
        voidItem={voidOrderItem}
        spostaVoce={spostaVoce}
        stampaConto={stampaConto}
        cambiaNota={cambiaNotaVoce}
        aggiungi={aggiungiAlConto}
        menu={menu}
        canali={canali}
      />
    </div>
  );
}
