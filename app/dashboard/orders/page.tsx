import OrderQueue from "@/components/OrderQueue";
import { requireModule } from "@/lib/module-guard";
import { advanceOrderStatus, setItemPrice } from "./actions";

export default async function OrdersPage() {
  await requireModule("qr_ordering");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Coda ordini</h1>
        <p className="mt-0.5 text-sm" style={{ color: "var(--muted)" }}>
          I più attesi in cima. Il colore segnala chi sta aspettando troppo.
        </p>
      </div>
      <OrderQueue advance={advanceOrderStatus} setItemPrice={setItemPrice} />
    </div>
  );
}
