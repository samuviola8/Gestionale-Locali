import { getCategoryProducts, formatPrice } from "@/lib/menu";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import PhotoUpload from "@/components/PhotoUpload";
import {
  toggleAvailable,
  deleteProduct,
  setProductImage,
  addVariant,
  deleteVariant,
  addIngredient,
  deleteIngredient,
} from "./actions";

// I prodotti di una categoria. Carica i propri dati da solo: e' quello che
// permette alla pagina di comparire prima e a questo elenco di arrivare dopo,
// dentro un <Suspense>, invece di far aspettare tutto insieme.
export default async function ElencoProdotti({
  tenantId,
  categoryId,
}: {
  tenantId: string;
  categoryId: string;
}) {
  const prodotti = await getCategoryProducts(tenantId, categoryId);

  if (prodotti.length === 0) {
    return (
      <div className="card" style={{ borderColor: "var(--border)" }}>
        <p className="p-4 text-sm" style={{ color: "var(--muted)" }}>
          Nessun prodotto in questa categoria.
        </p>
      </div>
    );
  }

  return (
    <div className="card divide-y" style={{ borderColor: "var(--border)" }}>
      {prodotti.map((p) => (
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
              {p.acceptsNote && (
                <span className="badge badge-brand ml-2">su richiesta</span>
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

            {/* Ingredienti: da qui nascono le scorciatoie "senza gin" che il
                cliente tocca invece di scrivere la nota a mano. */}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Ingredienti
              </span>
              {p.ingredients.map((ing) => (
                <form
                  key={ing}
                  action={deleteIngredient}
                  className="flex items-center gap-1 rounded-full pl-2.5 pr-1 text-xs"
                  style={{ background: "var(--surface-2)" }}
                >
                  <input type="hidden" name="productId" value={p.id} />
                  <input type="hidden" name="ingredient" value={ing} />
                  <span>{ing}</span>
                  <button
                    aria-label={`Togli ${ing} da ${p.name}`}
                    className="flex h-6 w-6 items-center justify-center rounded-full"
                    style={{ color: "var(--muted)" }}
                  >
                    ✕
                  </button>
                </form>
              ))}
              <form action={addIngredient} className="flex items-center gap-1">
                <input type="hidden" name="productId" value={p.id} />
                <input
                  name="ingredient"
                  aria-label={`Nuovo ingrediente di ${p.name}`}
                  placeholder="gin, menta…"
                  className="h-8 w-28 rounded-full px-2.5 text-xs"
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
              <ConfirmSubmit label="Elimina" ariaLabel={`Elimina ${p.name}`} />
            </form>
          </div>
        </div>
      ))}
    </div>
  );
}
