import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { requireModule } from "@/lib/module-guard";
import BillBoard from "@/components/BillBoard";
import {
  markAliasPaid,
  closeTable,
  setPartySize,
  stampaConto,
} from "./actions";
import { voidOrderItem } from "../orders/actions";

export default async function BillPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  await requireModule("split_bill");

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
        stampaConto={stampaConto}
      />
    </div>
  );
}
