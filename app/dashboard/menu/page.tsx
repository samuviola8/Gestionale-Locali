import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getMenu, formatPrice } from "@/lib/menu";
import Select from "@/components/Select";
import {
  addCategory,
  addProduct,
  toggleAvailable,
  deleteProduct,
  setProductImage,
  addVariant,
  deleteVariant,
} from "./actions";

const input = "rounded-lg border border-neutral-200 px-3 py-2 text-sm";

export default async function MenuAdmin() {
  const session = await getSessionUser();
  if (!session) redirect("/login");

  const menu = await getMenu(session.tenantId);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-medium">Menu</h1>

      <form action={addCategory} className="flex gap-2">
        <input name="name" placeholder="Nuova categoria" required className={input} />
        <button className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50">
          Aggiungi categoria
        </button>
      </form>

      {menu.length > 0 && (
        <form
          action={addProduct}
          className="grid gap-2 rounded-xl border border-neutral-200 p-4 sm:grid-cols-2"
        >
          <div className="font-medium sm:col-span-2">Aggiungi prodotto</div>
          <Select
            name="categoryId"
            options={menu.map((c) => ({ value: c.id, label: c.name }))}
          />
          <input name="name" placeholder="Nome" required className={input} />
          <input
            name="description"
            placeholder="Descrizione (facoltativa)"
            className={input + " sm:col-span-2"}
          />
          <input
            name="ingredients"
            placeholder="Ingredienti (separati da virgola)"
            className={input}
          />
          <input
            name="allergens"
            placeholder="Allergeni (separati da virgola)"
            className={input}
          />
          <input name="price" placeholder="Prezzo es. 7,00" required className={input} />
          <label className="flex items-center gap-2 text-sm text-neutral-600">
            Foto
            <input type="file" name="image" accept="image/*" className="text-xs" />
          </label>
          <button className="rounded-lg bg-[var(--brand)] px-3 py-2 text-sm text-[var(--brand-on)] sm:col-span-2">
            Aggiungi prodotto
          </button>
        </form>
      )}

      {menu.length === 0 ? (
        <p className="text-neutral-500">Crea la prima categoria per iniziare.</p>
      ) : (
        menu.map((cat) => (
          <section key={cat.id}>
            <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              {cat.name}
            </h2>
            <ul className="mt-2 divide-y divide-neutral-100">
              {cat.products.length === 0 && (
                <li className="py-3 text-sm text-neutral-400">Nessun prodotto.</li>
              )}
              {cat.products.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className={"flex items-center gap-3 " + (p.available ? "" : "opacity-40")}>
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.imageUrl}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-lg border border-neutral-200 object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-50)] text-lg font-medium text-[var(--brand-text)]">
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="font-medium">
                        {p.name}{" "}
                        <span className="font-normal text-neutral-500">
                          · {formatPrice(p.priceCents)}
                        </span>
                      </div>
                      {p.description && (
                        <div className="text-sm text-neutral-500">{p.description}</div>
                      )}

                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {p.variants.map((v) => (
                          <form
                            key={v.id}
                            action={deleteVariant}
                            className="flex items-center gap-1 rounded-full bg-neutral-100 pl-2.5 pr-1 text-xs"
                          >
                            <input type="hidden" name="id" value={v.id} />
                            <span>
                              {v.name} · {formatPrice(v.priceCents)}
                            </span>
                            <button
                              aria-label={`Elimina formato ${v.name}`}
                              className="px-1 text-neutral-400 hover:text-red-600"
                            >
                              ✕
                            </button>
                          </form>
                        ))}
                        <form action={addVariant} className="flex items-center gap-1">
                          <input type="hidden" name="productId" value={p.id} />
                          <input
                            name="variantName"
                            placeholder="formato"
                            className="w-20 rounded-full border border-dashed border-neutral-300 px-2 py-0.5 text-xs"
                          />
                          <input
                            name="variantPrice"
                            placeholder="€"
                            className="w-14 rounded-full border border-dashed border-neutral-300 px-2 py-0.5 text-xs"
                          />
                          <button className="text-xs text-[var(--brand-text)]">
                            + formato
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <form action={setProductImage} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={p.id} />
                      <input
                        type="file"
                        name="image"
                        accept="image/*"
                        className="w-24 text-xs"
                      />
                      <button className="rounded-lg border border-neutral-200 px-2 py-1.5 text-xs hover:bg-neutral-50">
                        Carica
                      </button>
                    </form>
                    <form action={toggleAvailable}>
                      <input type="hidden" name="id" value={p.id} />
                      <button className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs hover:bg-neutral-50">
                        {p.available ? "Disponibile" : "Non disp."}
                      </button>
                    </form>
                    <form action={deleteProduct}>
                      <input type="hidden" name="id" value={p.id} />
                      <button className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50">
                        Elimina
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
