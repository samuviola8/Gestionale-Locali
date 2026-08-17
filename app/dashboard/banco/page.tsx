import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  menuCategories,
  menuProducts,
  menuProductVariants,
  tenants,
} from "@/lib/db/schema";
import { leggiCalendario } from "@/lib/orari";
import { getSessionUser } from "@/lib/auth";
import { requireModule } from "@/lib/module-guard";
import { getTenantModules } from "@/lib/modules";
import { CHANNELS, type Channel } from "@/lib/channels";
import CassaBanco, { type ProdottoCassa } from "@/components/CassaBanco";
import { createCounterOrder } from "./actions";

export default async function BancoPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  await requireModule("counter_orders");

  const modules = await getTenantModules(session.tenantId);
  const [locale] = await db
    .select({
      openingHours: tenants.openingHours,
      closureDays: tenants.closureDays,
      banco: tenants.printComandaBanco,
      asporto: tenants.printComandaAsporto,
      domicilio: tenants.printComandaDomicilio,
      scontrino: tenants.printScontrinoCassa,
    })
    .from(tenants)
    .where(eq(tenants.id, session.tenantId))
    .limit(1);
  // Asporto e domicilio si battono dalla stessa cassa, ma solo se il locale
  // li ha: non ha senso mostrare linguette che non portano da nessuna parte.
  const canaliAttivi = CHANNELS.filter(
    (c) => c.key !== "tavolo" && c.module && modules[c.module]
  ).map((c) => c.key as Channel);

  const righe = await db
    .select({
      id: menuProducts.id,
      name: menuProducts.name,
      priceCents: menuProducts.priceCents,
      pinned: menuProducts.pinned,
      acceptsNote: menuProducts.acceptsNote,
      categoria: menuCategories.name,
      categoriaOrdine: menuCategories.sortOrder,
      variantId: menuProductVariants.id,
      variantName: menuProductVariants.name,
      variantPrice: menuProductVariants.priceCents,
      variantAvailable: menuProductVariants.available,
    })
    .from(menuProducts)
    .innerJoin(menuCategories, eq(menuCategories.id, menuProducts.categoryId))
    .leftJoin(
      menuProductVariants,
      eq(menuProductVariants.productId, menuProducts.id)
    )
    .where(
      and(
        eq(menuProducts.tenantId, session.tenantId),
        eq(menuProducts.available, true)
      )
    )
    .orderBy(
      asc(menuCategories.sortOrder),
      asc(menuProducts.sortOrder),
      asc(menuProducts.name)
    );

  const mappa = new Map<string, ProdottoCassa>();
  for (const r of righe) {
    if (!mappa.has(r.id)) {
      mappa.set(r.id, {
        id: r.id,
        name: r.name,
        priceCents: r.priceCents,
        categoria: r.categoria,
        pinned: r.pinned,
        acceptsNote: r.acceptsNote,
        variants: [],
      });
    }
    if (r.variantId && r.variantAvailable) {
      mappa.get(r.id)!.variants.push({
        id: r.variantId,
        name: r.variantName!,
        priceCents: r.variantPrice!,
      });
    }
  }

  // I preferiti in cima anche dentro la loro categoria.
  const prodotti = [...mappa.values()].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned)
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Cassa al banco</h1>
        <p className="mt-0.5 text-sm" style={{ color: "var(--muted)" }}>
          Un tocco per prodotto. Al banco si incassa subito, asporto e domicilio
          restano fra i conti aperti.
        </p>
      </div>

      <CassaBanco
        prodotti={prodotti}
        canaliAttivi={canaliAttivi}
        orari={leggiCalendario(locale?.openingHours, locale?.closureDays)}
        stampaPredefinita={{
          comanda: {
            banco: locale?.banco ?? false,
            asporto: locale?.asporto ?? false,
            domicilio: locale?.domicilio ?? false,
          },
          scontrino: locale?.scontrino ?? false,
        }}
        invia={createCounterOrder}
      />
    </div>
  );
}
