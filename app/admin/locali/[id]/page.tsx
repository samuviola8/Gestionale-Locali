import { redirect, notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  tenants,
  users,
  orders,
  orderItems,
  menuProducts,
  restaurantTables,
} from "@/lib/db/schema";
import { getAdminUser } from "@/lib/admin-auth";
import { formatPrice } from "@/lib/menu";
import { MODULES, getTenantModules } from "@/lib/modules";
import { THEME_PRESETS } from "@/lib/themes";
import { SKINS } from "@/components/skins";
import DeleteLocaleButton from "@/components/DeleteLocaleButton";
import {
  renameLocale,
  toggleSuspend,
  deleteLocale,
  saveModules,
  saveBranding,
  saveService,
} from "./actions";

const input = "input";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

export default async function LocaleDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ creato?: string }>;
}) {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");

  const { id } = await params;
  const { creato } = await searchParams;
  const t = (
    await db.select().from(tenants).where(eq(tenants.id, id)).limit(1)
  )[0];
  if (!t) notFound();

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const allOrders = await db
    .select({ id: orders.id, createdAt: orders.createdAt })
    .from(orders)
    .where(eq(orders.tenantId, id));
  const ordersToday = allOrders.filter(
    (o) => o.createdAt.getTime() >= start.getTime()
  ).length;
  const orderIds = allOrders.map((o) => o.id);
  const items = orderIds.length
    ? await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds))
    : [];
  const incassoTot = items
    .filter((i) => i.paid)
    .reduce((s, i) => s + i.priceCents * i.quantity, 0);
  const staff = await db
    .select({ email: users.email, role: users.role })
    .from(users)
    .where(eq(users.tenantId, id));
  const prodCount = (
    await db.select({ id: menuProducts.id }).from(menuProducts).where(eq(menuProducts.tenantId, id))
  ).length;
  const tableCount = (
    await db
      .select({ id: restaurantTables.id })
      .from(restaurantTables)
      .where(eq(restaurantTables.tenantId, id))
  ).length;

  const modules = await getTenantModules(id);

  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  const proto = process.env.NODE_ENV === "production" ? "https" : "http";

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <main className="mx-auto max-w-3xl space-y-8 px-6 py-8">
        {creato && (
          <div
            className="rounded-xl border px-4 py-3 text-sm"
            style={{
              borderColor: "var(--brand)",
              background: "var(--brand-50)",
              color: "var(--brand-text)",
            }}
          >
            <strong>Locale creato.</strong> Restano da fare: caricare il menu
            reale (prodotti e prezzi) e stampare i QR dei tavoli dalla dashboard
            del locale.
          </div>
        )}

        <div>
          <a href="/admin" className="text-sm text-neutral-500 hover:underline">
            ← Panoramica
          </a>
          <div className="mt-2 flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{t.name}</h1>
            {t.suspended && (
              <span className="badge badge-warn">Sospeso</span>
            )}
          </div>
          <a
            href={`${proto}://${t.slug}.${root}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-[var(--brand-text)]"
          >
            {t.slug}.{root}
          </a>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Ordini oggi" value={ordersToday} />
          <Stat label="Ordini totali" value={allOrders.length} />
          <Stat label="Incasso totale" value={formatPrice(incassoTot)} />
          <Stat label="Utenti" value={staff.length} />
          <Stat label="Prodotti menu" value={prodCount} />
          <Stat label="Tavoli" value={tableCount} />
        </div>

        <section>
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>Anagrafica</h2>
          <dl className="card grid gap-x-6 gap-y-2 p-4 text-sm sm:grid-cols-2">
            {[
              ["Ragione sociale", t.legalName],
              ["Telefono", t.phone],
              [
                "Indirizzo",
                [t.address, [t.postalCode, t.city].filter(Boolean).join(" "), t.province]
                  .filter(Boolean)
                  .join(", "),
              ],
              ["Referente", t.contactName],
              ["Email referente", t.contactEmail],
              ["Note", t.notes],
            ].map(([k, v]) => (
              <div key={k as string} className="flex justify-between gap-3">
                <dt className="text-neutral-500">{k}</dt>
                <dd className="text-right">{v || <span className="text-neutral-300">—</span>}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>Account</h2>
          <ul className="card divide-y">
            {staff.length === 0 && (
              <li className="px-4 py-3 text-sm text-neutral-400">Nessun account.</li>
            )}
            {staff.map((u, i) => (
              <li key={i} className="flex justify-between px-4 py-3 text-sm">
                <span>{u.email}</span>
                <span className="text-neutral-500">
                  {u.role === "owner" ? "Titolare" : "Staff"}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>Moduli</h2>
          <form
            action={saveModules}
            className="card space-y-2 p-4"
          >
            <input type="hidden" name="id" value={t.id} />
            {MODULES.map((m) => (
              <label key={m.key} className="flex items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  name={`modulo_${m.key}`}
                  defaultChecked={modules[m.key]}
                  disabled={m.comingSoon}
                  className="mt-px"
                />
                <span>
                  <span className="font-medium">{m.label}</span>
                  {m.addon && (
                    <span
                      className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{
                        background: "var(--brand-50)",
                        color: "var(--brand-text)",
                      }}
                    >
                      add-on
                    </span>
                  )}
                  {m.comingSoon && (
                    <span className="ml-2 text-[10px] text-neutral-400">
                      in sviluppo
                    </span>
                  )}
                  <span className="mt-0.5 block text-xs text-neutral-500">
                    {m.description}
                  </span>
                </span>
              </label>
            ))}
            <button className="mt-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50">
              Salva moduli
            </button>
          </form>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>
            Servizio
          </h2>
          <form action={saveService} className="card grid gap-3 p-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={t.id} />
            <div>
              <div className="mb-1 text-xs" style={{ color: "var(--muted)" }}>
                Coperto a persona
              </div>
              <input
                name="coverCharge"
                defaultValue={
                  t.coverChargeCents ? (t.coverChargeCents / 100).toFixed(2).replace(".", ",") : ""
                }
                placeholder="2,00"
                className={input + " w-full"}
              />
              <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                In euro. Lascia vuoto se il locale non lo applica. Viene
                addebitato a ogni persona seduta al tavolo.
              </p>
            </div>
            <div>
              <div className="mb-1 text-xs" style={{ color: "var(--muted)" }}>
                Durata sessione tavolo (minuti)
              </div>
              <input
                name="tableSessionMinutes"
                type="number"
                min="15"
                max="1440"
                defaultValue={t.tableSessionMinutes}
                className={input + " w-full"}
              />
              <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                Scaduta, il cliente deve riscansionare il QR.
              </p>
            </div>
            <button className="btn btn-sm sm:col-span-2 sm:justify-self-start">
              Salva servizio
            </button>
          </form>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>Aspetto</h2>
          <form
            action={saveBranding}
            className="card grid gap-3 p-4 sm:grid-cols-2"
          >
            <input type="hidden" name="id" value={t.id} />
            <div>
              <div className="mb-1 text-xs text-neutral-500">Preset di tema</div>
              <select name="themePreset" defaultValue={t.themePreset} className={input + " w-full"}>
                {THEME_PRESETS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="mb-1 text-xs text-neutral-500">Skin del menu</div>
              <select
                name="menuSkin"
                defaultValue={t.menuSkin}
                className={input + " w-full"}
              >
                {SKINS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-neutral-400">
                Cambia solo l&apos;aspetto della pagina cliente, non come funziona.
              </p>
            </div>
            <div>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  name="menuBranding"
                  defaultChecked={t.menuBranding}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm">Firma in fondo al menu</span>
                  <span className="block text-xs text-neutral-400">
                    La riga &quot;Menu con Comanda&quot; sotto l&apos;ultima
                    categoria, che porta alla vetrina. Si toglie a chi non la
                    vuole.
                  </span>
                </span>
              </label>
            </div>
            <div>
              <div className="mb-1 text-xs text-neutral-500">Tema di default</div>
              <select
                name="defaultTheme"
                defaultValue={t.defaultTheme}
                className={input + " w-full"}
              >
                <option value="dark">Scuro</option>
                <option value="light">Chiaro</option>
                <option value="system">Come il telefono</option>
              </select>
            </div>
            <div>
              <div className="mb-1 text-xs text-neutral-500">
                Colore brand (tema chiaro)
              </div>
              <input
                name="brandColor"
                defaultValue={t.brandColor ?? ""}
                placeholder="#c9a227"
                className={input + " w-full"}
              />
            </div>
            <div>
              <div className="mb-1 text-xs text-neutral-500">
                Colore brand (tema scuro)
              </div>
              <input
                name="brandAccent"
                defaultValue={t.brandAccent ?? ""}
                placeholder="derivato se vuoto"
                className={input + " w-full"}
              />
            </div>
            <div>
              <div className="mb-1 text-xs text-neutral-500">
                Logo {t.logoUrl && "(ne è già presente uno)"}
              </div>
              <input
                name="logo"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="w-full text-xs"
              />
            </div>
            <button className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50 sm:col-span-2 sm:justify-self-start">
              Salva aspetto
            </button>
          </form>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>Gestione</h2>
          <div className="card space-y-3 p-4">
            <form action={renameLocale} className="flex gap-2">
              <input type="hidden" name="id" value={t.id} />
              <input name="name" defaultValue={t.name} className={input + " flex-1"} />
              <button className="btn btn-sm">
                Salva nome
              </button>
            </form>
            <form action={toggleSuspend}>
              <input type="hidden" name="id" value={t.id} />
              <button className="btn btn-sm">
                {t.suspended ? "Riattiva locale" : "Sospendi locale"}
              </button>
            </form>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium text-red-600">Zona pericolosa</h2>
          <div className="card p-4">
            <p className="text-sm text-neutral-500">
              Elimina definitivamente questo locale e tutti i suoi dati.
            </p>
            <div className="mt-3">
              <DeleteLocaleButton id={t.id} name={t.name} deleteAction={deleteLocale} />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
