import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import {
  getMenuCategories,
  countProductsWithoutPhoto,
  formatPrice,
} from "@/lib/menu";
import Select from "@/components/Select";
import Field from "@/components/Field";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import PhotoUpload from "@/components/PhotoUpload";
import MenuSkeleton from "@/components/MenuSkeleton";
import ElencoProdotti from "./ElencoProdotti";
import {
  addCategory,
  addProduct,
  toggleAvailable,
  deleteProduct,
  setProductImage,
  addVariant,
  deleteVariant,
  setCoverCharge,
} from "./actions";

export default async function MenuAdmin({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>;
}) {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  const { cat } = await searchParams;

  // Il guscio non aspetta i prodotti: gli bastano i nomi delle categorie e
  // due conteggi. L'elenco arriva dopo, dentro un <Suspense>.
  const [menu, tenant, senzaFoto] = await Promise.all([
    getMenuCategories(session.tenantId),
    db
      .select({ coverChargeCents: tenants.coverChargeCents })
      .from(tenants)
      .where(eq(tenants.id, session.tenantId))
      .limit(1),
    countProductsWithoutPhoto(session.tenantId),
  ]);

  const coperto = tenant[0]?.coverChargeCents ?? 0;
  const totale = menu.reduce((s, c) => s + c.productCount, 0);

  // Una categoria per volta: centocinquanta prodotti insieme pesavano
  // megabyte e montavano centinaia di componenti interattivi.
  const categoriaAttiva = menu.find((c) => c.id === cat) ?? menu[0] ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Menu</h1>
        <p className="mt-0.5 text-sm" style={{ color: "var(--muted)" }}>
          {menu.length} {menu.length === 1 ? "categoria" : "categorie"} ·{" "}
          {totale} {totale === 1 ? "prodotto" : "prodotti"}
          {senzaFoto > 0 && ` · ${senzaFoto} senza foto`}
        </p>
      </div>

      {/* Con molte categorie scorrere fino in fondo e' una perdita di tempo. */}
      {menu.length > 1 && (
        <div
          className="sticky top-[57px] z-20 -mx-6 px-6 py-2.5 backdrop-blur lg:-mx-8 lg:px-8"
          style={{
            background: "color-mix(in srgb, var(--bg) 82%, transparent)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div className="scroll-x flex gap-2">
            {menu.map((c) => {
              const attiva = c.id === categoriaAttiva?.id;
              return (
                <Link
                  key={c.id}
                  href={`/dashboard/menu?cat=${c.id}`}
                  scroll={false}
                  aria-current={attiva}
                  className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm"
                  style={
                    attiva
                      ? { background: "var(--brand)", color: "var(--brand-on)" }
                      : { background: "var(--surface-2)", color: "var(--text)" }
                  }
                >
                  {c.name}
                  <span
                    className="tnum text-xs"
                    style={{ opacity: attiva ? 0.7 : 1, color: attiva ? "inherit" : "var(--muted)" }}
                  >
                    {c.productCount}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Sta qui e non nelle impostazioni perche' e' una voce di listino: chi
          aggiorna i prezzi del menu e' la stessa persona che decide il coperto. */}
      <form
        action={setCoverCharge}
        className="card flex flex-wrap items-end gap-3 p-4"
      >
        <Field
          label="Coperto"
          hint="Prezzo fisso a persona, aggiunto al conto di ognuno. Lascia vuoto se non lo applichi."
          className="min-w-[140px]"
        >
          <div className="flex items-center gap-2">
            <input
              name="coverCharge"
              defaultValue={
                coperto ? (coperto / 100).toFixed(2).replace(".", ",") : ""
              }
              placeholder="2,00"
              inputMode="decimal"
              aria-label="Coperto a persona, in euro"
              className="input w-28"
            />
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              € a persona
            </span>
          </div>
        </Field>
        <button className="btn btn-sm">Salva coperto</button>
        {coperto > 0 && (
          <span className="badge badge-muted mb-1.5">
            ora: {formatPrice(coperto)}
          </span>
        )}
      </form>

      <div className="grid gap-3 sm:grid-cols-2">
        <details className="disclosure">
          <summary>Nuova categoria</summary>
          <div className="disclosure-body">
            <form action={addCategory} className="flex flex-wrap gap-2">
              <Field label="Nome della categoria" className="min-w-[200px] flex-1">
                <input
                  name="name"
                  required
                  placeholder="Cocktail"
                  className="input"
                />
              </Field>
              <button className="btn btn-primary self-end">Aggiungi</button>
            </form>
          </div>
        </details>

        {menu.length > 0 && (
          <details className="disclosure">
            <summary>Nuovo prodotto</summary>
            <div className="disclosure-body">
              <form action={addProduct} className="grid gap-3 sm:grid-cols-2">
                <Field label="Categoria">
                  <Select
                    name="categoryId"
                    options={menu.map((c) => ({ value: c.id, label: c.name }))}
                  />
                </Field>
                <Field label="Nome *">
                  <input name="name" required placeholder="Negroni" className="input" />
                </Field>
                <Field label="Descrizione" className="sm:col-span-2">
                  <input
                    name="description"
                    placeholder="Gin, vermouth rosso, Campari"
                    className="input"
                  />
                </Field>
                <Field label="Ingredienti" hint="Separati da virgola">
                  <input name="ingredients" className="input" />
                </Field>
                <Field label="Allergeni" hint="Separati da virgola">
                  <input name="allergens" className="input" />
                </Field>
                <Field label="Prezzo *" hint="In euro, es. 12,00">
                  <input name="price" required placeholder="12,00" className="input" />
                </Field>
                <Field label="Foto">
                  <PhotoUpload label="Scegli una foto" />
                </Field>
                <button className="btn btn-primary sm:col-span-2">
                  Aggiungi prodotto
                </button>
              </form>
            </div>
          </details>
        )}
      </div>

      {menu.length === 0 ? (
        <div className="card px-6 py-14 text-center">
          <div className="text-base font-medium">Il menu è vuoto</div>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Crea la prima categoria qui sopra, poi aggiungi i prodotti.
          </p>
        </div>
      ) : categoriaAttiva ? (
        <section className="scroll-mt-32">
          <div className="mb-2 flex items-baseline gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider">
              {categoriaAttiva.name}
            </h2>
            <span className="tnum text-xs" style={{ color: "var(--muted)" }}>
              {categoriaAttiva.productCount}
            </span>
          </div>

          {/* La chiave sulla categoria fa ricomparire le sagome a ogni
              cambio: senza, si resterebbe fermi sull'elenco precedente
              senza capire che ne sta arrivando un altro. */}
          <Suspense
            key={categoriaAttiva.id}
            fallback={
              <MenuSkeleton
                righe={Math.min(categoriaAttiva.productCount || 3, 8)}
              />
            }
          >
            <ElencoProdotti
              tenantId={session.tenantId}
              categoryId={categoriaAttiva.id}
            />
          </Suspense>
        </section>
      ) : null}
    </div>
  );
}
