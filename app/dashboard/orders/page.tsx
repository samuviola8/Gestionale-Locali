import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import OrderQueue from "@/components/OrderQueue";
import { requireAnyModule } from "@/lib/module-guard";
import { getTenantModules } from "@/lib/modules";
import { CHANNELS } from "@/lib/channels";
import { leggiImpostazioniWeb, canaliWeb, sospesoAdesso } from "@/lib/ordini-web";
import {
  accettaOrdine,
  advanceOrderStatus,
  rifiutaOrdine,
  segnaPronto,
  segnaPartito,
  setItemPrice,
  sospendiOrdiniWeb,
  voidOrderItem,
} from "./actions";

export default async function OrdersPage() {
  // La coda non e' del QR: ci finiscono i tavoli, il banco, gli asporti e le
  // consegne. Un locale che fa solo asporto dal sito deve poterla aprire, o
  // gli ordini che riceve non li vede nessuno.
  await requireAnyModule([
    "qr_ordering",
    "counter_orders",
    "takeaway",
    "delivery",
  ]);

  const session = await getSessionUser();
  if (!session) redirect("/login");

  const [modules, [locale]] = await Promise.all([
    getTenantModules(session.tenantId),
    db
      .select({
        callSound: tenants.callSound,
        webOrderChannels: tenants.webOrderChannels,
        webOrderPiecesPerSlot: tenants.webOrderPiecesPerSlot,
        webOrdersPausedUntil: tenants.webOrdersPausedUntil,
      })
      .from(tenants)
      .where(eq(tenants.id, session.tenantId))
      .limit(1),
  ]);

  // I canali che questo locale ha davvero: sono le pillole del filtro. La sala
  // c'e' se c'e' il QR o il cameriere; gli altri li accende il loro modulo.
  const canali = CHANNELS.filter((c) =>
    c.module ? modules[c.module] : modules.qr_ordering
  ).map((c) => c.key);

  const cfgWeb = locale ? leggiImpostazioniWeb(locale) : null;
  const sospesoFino =
    locale && sospesoAdesso(locale.webOrdersPausedUntil)
      ? locale.webOrdersPausedUntil!.toISOString()
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Coda ordini</h1>
        <p className="mt-0.5 text-sm" style={{ color: "var(--muted)" }}>
          {cfgWeb && canaliWeb(cfgWeb, modules).length
            ? "I più attesi in cima, e in testa quelli dal sito che aspettano una risposta."
            : "I più attesi in cima. Il colore segnala chi sta aspettando troppo."}
        </p>
      </div>
      <OrderQueue
        advance={advanceOrderStatus}
        setItemPrice={setItemPrice}
        voidItem={voidOrderItem}
        accetta={accettaOrdine}
        rifiuta={rifiutaOrdine}
        pronto={segnaPronto}
        partito={segnaPartito}
        sospendi={sospendiOrdiniWeb}
        canali={canali}
        vendeDalWeb={!!cfgWeb && canaliWeb(cfgWeb, modules).length > 0}
        suono={locale?.callSound ?? "campanello"}
        sospesoFinoIniziale={sospesoFino}
      />
    </div>
  );
}
