import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { getMenu, formatPrice } from "@/lib/menu";
import Select from "@/components/Select";
import Field from "@/components/Field";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import PhotoUpload from "@/components/PhotoUpload";
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

  const menu = await getMenu(session.tenantId);
  const tenant = (
    await db
      .select({ coverChargeCents: tenants.coverChargeCents })
      .from(tenants)
      .where(eq(tenants.id, session.tenantId))
      .limit(1)
  )[0];
  const coperto = tenant?.coverChargeCents ?? 0;
  const totale = menu.reduce((s, c) => s + c.products.length, 0);

  // Si mostra una categoria per volta. Con centocinquanta prodotti la pagina
  // intera pesava megabyte e montava centinaia di componenti interattivi:
  // aprirla richiedeva un secondo e mezzo.
  const categoriaAttiva =
    menu.find((c) => c.id === cat) ?? menu[0] ?? null;
  const senzaFoto = menu.reduce(
    (s, c) => s + c.products.filter((p) => !p.imageUrl).length,
    0
  );

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
          <div className="flex gap-2 overflow-x-auto">
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
                    {c.products.length}
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
        (() => {
          const cat = categoriaAttiva;
          return (
          <section key={cat.id} className="scroll-mt-32">
            <div className="mb-2 flex items-baseline gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider">
                {cat.name}
              </h2>
              <span className="tnum text-xs" style={{ color: "var(--muted)" }}>
                {cat.products.length}
              </span>
            </div>

            <div className="card divide-y" style={{ borderColor: "var(--border)" }}>
              {cat.products.length === 0 && (
                <p className="p-4 text-sm" style={{ color: "var(--muted)" }}>
                  Nessun prodotto in questa categoria.
                </p>
              )}

              {cat.products.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-start gap-3 p-3"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className={p.available ? "" : "opacity-45"}>
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.imageUrl}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-lg object-cover"
                        style={{ border: "1px solid var(--border)" }}
                      />
                    ) : (
                      <div
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-lg font-medium"
                        style={{
                          background: "var(--brand-50)",
                          color: "var(--brand-text)",
                        }}
                      >
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div className="min-w-[180px] flex-1">
                    <div className={p.available ? "" : "opacity-45"}>
                      <span className="font-medium">{p.name}</span>
                      <span className="tnum ml-2" style={{ color: "var(--muted)" }}>
                        {formatPrice(p.priceCents)}
                      </span>
                      {!p.available && (
                        <span className="badge badge-warn ml-2">Esaurito</span>
                      )}
                      {p.description && (
                        <div className="text-sm" style={{ color: "var(--muted)" }}>
                          {p.description}
                        </div>
                      )}
                    </div>

                    {/* Formati: chip con la crocetta per toglierli, campo in coda
                        per aggiungerne uno senza aprire altre schermate. */}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {p.variants.map((v) => (
                        <form
                          key={v.id}
                          action={deleteVariant}
                          className="flex items-center gap-1 rounded-full pl-2.5 pr-1 text-xs"
                          style={{ background: "var(--surface-2)" }}
                        >
                          <input type="hidden" name="id" value={v.id} />
                          <span className="tnum">
                            {v.name} · {formatPrice(v.priceCents)}
                          </span>
                          <button
                            aria-label={`Elimina il formato ${v.name} di ${p.name}`}
                            className="flex h-6 w-6 items-center justify-center rounded-full"
                            style={{ color: "var(--muted)" }}
                          >
                            ✕
                          </button>
                        </form>
                      ))}
                      <form action={addVariant} className="flex items-center gap-1">
                        <input type="hidden" name="productId" value={p.id} />
                        <input
                          name="variantName"
                          aria-label={`Nome del nuovo formato di ${p.name}`}
                          placeholder="formato"
                          className="h-8 w-24 rounded-full px-2.5 text-xs"
                          style={{
                            border: "1px dashed var(--border)",
                            background: "transparent",
                            color: "var(--text)",
                          }}
                        />
                        <input
                          name="variantPrice"
                          aria-label={`Prezzo del nuovo formato di ${p.name}`}
                          placeholder="€"
                          className="h-8 w-16 rounded-full px-2.5 text-xs"
                          style={{
                            border: "1px dashed var(--border)",
                            background: "transparent",
                            color: "var(--text)",
                          }}
                        />
                        <button
                          className="h-8 rounded-full px-2.5 text-xs"
                          style={{ color: "var(--brand-text)" }}
                        >
                          aggiungi
                        </button>
                      </form>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <form action={setProductImage}>
                      <input type="hidden" name="id" value={p.id} />
                      <PhotoUpload
                        label={p.imageUrl ? "Cambia foto" : "Aggiungi foto"}
                        ariaLabel={`${p.imageUrl ? "Cambia" : "Aggiungi"} la foto di ${p.name}`}
                        autoSubmit
                      />
                    </form>
                    <form action={toggleAvailable}>
                      <input type="hidden" name="id" value={p.id} />
                      <button className="btn btn-sm">
                        {p.available ? "Segna esaurito" : "Rimetti disponibile"}
                      </button>
                    </form>
                    <form action={deleteProduct}>
                      <input type="hidden" name="id" value={p.id} />
                      <ConfirmSubmit
                        label="Elimina"
                        ariaLabel={`Elimina ${p.name}`}
                      />
                    </form>
                  </div>
                </div>
              ))}
            </div>
          </section>
          );
        })()
      ) : null}
    </div>
  );
}
