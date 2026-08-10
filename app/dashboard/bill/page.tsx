import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import BillBoard from "@/components/BillBoard";
import { markAliasPaid, closeTable } from "./actions";

export default async function BillPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-medium">Conti aperti</h1>
        <span className="inline-flex items-center gap-1.5 text-sm text-neutral-500">
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--brand)]" />
          in tempo reale
        </span>
      </div>
      <BillBoard markAliasPaid={markAliasPaid} closeTable={closeTable} />
    </div>
  );
}
