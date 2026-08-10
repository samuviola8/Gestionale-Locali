import OrderQueue from "@/components/OrderQueue";
import { advanceOrderStatus } from "./actions";

export default function OrdersPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-medium">Coda ordini</h1>
        <span className="inline-flex items-center gap-1.5 text-sm text-neutral-500">
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--brand)]" />
          in tempo reale
        </span>
      </div>
      <OrderQueue advance={advanceOrderStatus} />
    </div>
  );
}
