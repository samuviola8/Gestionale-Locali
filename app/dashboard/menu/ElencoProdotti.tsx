import { getCategoryProducts, searchProducts, formatPrice } from "@/lib/menu";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import PhotoUpload from "@/components/PhotoUpload";
import Field from "@/components/Field";
import Select from "@/components/Select";
import {
  toggleAvailable,
  deleteProduct,
  updateProduct,
  setProductImage,
  addVariant,
  deleteVariant,
  addIngredient,
  deleteIngredient,
  togglePinned,
  toggleRequiresGlasses,
} from "./actions";

// I prodotti di una categoria. Carica i propri dati da solo: e' quello che
// permette alla pagina di comparire prima e a questo elenco di arrivare dopo,
// dentro un <Suspense>, invece di far aspettare tutto insieme.
export default async function ElencoProdotti({
  tenantId,
  categoryId,
  cerca,
  categorie,
}: {
  tenantId: string;
  categoryId?: string;
  // Con un testo da cercare l'elenco guarda tutto il menu invece della sola
  // categoria: le righe sono le stesse, cambia solo cosa le riempie.
  cerca?: string;
  // Le sezioni del menu, per poter spostare un prodotto da una all'altra. Le
  // passa la pagina, che le ha gia' caricate per le pillole in cima.
  categorie: { id: string; name: string }[];
}) {
  const prodotti = cerca
    ? await searchProducts(tenantId, cerca)
    : categoryId
      ? await getCategoryProducts(tenantId, categoryId)
      : [];

  if (prodotti.length === 0) {
    return (
      <div className="card" style={{ borderColor: "var(--border)" }}>
        <p className="p-4 text-sm" style={{ color: "var(--muted)" }}>
          {cerca
            ? `Nessun prodotto per «${cerca}».`
            : "Nessun prodotto in questa categoria."}
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
              {p.requiresGlasses && (
                <span className="badge badge-brand ml-2">chiede i calici</span>
              )}
              {p.pinned && (
                <span className="badge badge-brand ml-2">★ preferito</span>
              )}
              {/* Solo fra i risultati di ricerca: qui le righe arrivano da
                  sezioni diverse e senza l'etichetta non si sa da quale. */}
              {p.categoria && (
                <span className="badge ml-2">{p.categoria}</span>
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
            <form action={togglePinned}>
              <input type="hidden" name="id" value={p.id} />
              <button
                className="btn btn-sm"
                aria-label={
                  p.pinned
                    ? `Togli ${p.name} dai preferiti del banco`
                    : `Metti ${p.name} fra i preferiti del banco`
                }
                style={p.pinned ? { color: "var(--brand-text)" } : undefined}
              >
                {p.pinned ? "★ Preferito" : "☆ Preferito"}
              </button>
            </form>
            <form action={toggleRequiresGlasses}>
              <input type="hidden" name="id" value={p.id} />
              <button
                className="btn btn-sm"
                aria-label={
                  p.requiresGlasses
                    ? `Non chiedere piu' i calici per ${p.name}`
                    : `Chiedi i calici quando ordinano ${p.name}`
                }
                style={p.requiresGlasses ? { color: "var(--brand-text)" } : undefined}
              >
                {p.requiresGlasses ? "Chiede i calici" : "Chiedi i calici"}
              </button>
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

          {/* Prima di questo, correggere un prezzo voleva dire cancellare il
              prodotto e rifarlo: e rifarlo perdeva formati, ingredienti e foto.
              Chiuso di suo, perche' la riga si legge molto piu' spesso di
              quanto si corregga. */}
          <details className="disclosure w-full">
            <summary>Modifica</summary>
            <div className="disclosure-body">
              <form action={updateProduct} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="id" value={p.id} />
                <Field label="Categoria">
                  <Select
                    name="categoryId"
                    ariaLabel={`Categoria di ${p.name}`}
                    defaultValue={p.categoryId}
                    options={categorie.map((c) => ({
                      value: c.id,
                      label: c.name,
                    }))}
                  />
                </Field>
                <Field label="Nome *">
                  <input
                    name="name"
                    required
                    defaultValue={p.name}
                    aria-label={`Nome di ${p.name}`}
                    className="input"
                  />
                </Field>
                <Field label="Prezzo *" hint="In euro, es. 12,00">
                  <input
                    name="price"
                    required
                    inputMode="decimal"
                    defaultValue={(p.priceCents / 100).toFixed(2).replace(".", ",")}
                    aria-label={`Prezzo di ${p.name}`}
                    className="input"
                  />
                </Field>
                <Field label="Descrizione">
                  <input
                    name="description"
                    defaultValue={p.description ?? ""}
                    aria-label={`Descrizione di ${p.name}`}
                    className="input"
                  />
                </Field>
                {/* Gli allergeni si scrivono solo qui: in creazione erano un
                    campo, e poi non c'era piu' modo di rimetterci mano. */}
                <Field
                  label="Allergeni"
                  hint="Separati da virgola"
                  className="sm:col-span-2"
                >
                  <input
                    name="allergens"
                    defaultValue={p.allergens.join(", ")}
                    aria-label={`Allergeni di ${p.name}`}
                    className="input"
                  />
                </Field>
                <label className="flex items-start gap-2.5 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    name="acceptsNote"
                    defaultChecked={p.acceptsNote}
                    className="mt-px"
                  />
                  <span>
                    <span className="font-medium">Su richiesta</span>
                    <span
                      className="mt-0.5 block text-xs"
                      style={{ color: "var(--muted)" }}
                    >
                      Il cliente scrive cosa desidera invece di scegliere. Il
                      prezzo qui sopra è quello di partenza.
                    </span>
                  </span>
                </label>
                <div className="flex items-center gap-3 sm:col-span-2">
                  <button className="btn btn-primary">Salva</button>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    Formati, ingredienti, foto ed esaurito si cambiano dalla riga
                    qui sopra.
                  </span>
                </div>
              </form>
            </div>
          </details>
        </div>
      ))}
    </div>
  );
}
