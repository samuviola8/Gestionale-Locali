"use client";

import { formatPrice } from "@/lib/format";
import type {
  CategoryNavProps,
  CategorySectionProps,
  HeroProps,
  ProductCardProps,
  ProductSheetProps,
  Skin,
} from "./types";

// Skin di serie: sobria, leggibile, adatta a qualsiasi locale.
// E' quella che riceve un cliente nuovo finche' non gliene si disegna una sua.

// Segnaposto per i prodotti senza foto: tinte derivate dal brand del locale,
// non colori casuali, cosi' restano dentro la sua palette.
function placeholder(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  const mix = 10 + (h % 14);
  const angle = 120 + (h % 60);
  return `linear-gradient(${angle}deg, color-mix(in srgb, var(--brand) ${mix}%, var(--surface-2)), var(--surface-2))`;
}

function Hero({ tenantName, logoUrl, tableNumber }: HeroProps) {
  return (
    <div
      className="overflow-hidden rounded-3xl px-5 py-6 text-white"
      style={{
        background: "linear-gradient(135deg, var(--hero-from), var(--hero-to))",
      }}
    >
      <div className="flex items-center justify-between">
        <span
          className="text-[11px] font-medium uppercase tracking-wider"
          style={{ color: "color-mix(in srgb, var(--brand) 45%, #ffffff)" }}
        >
          Ordina al tavolo
        </span>
        <span className="rounded-full bg-white/15 px-3 py-1 text-xs">
          Tavolo {tableNumber}
        </span>
      </div>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={tenantName}
          className="mt-3 h-14 w-auto max-w-[75%] object-contain object-left"
        />
      ) : (
        <h1 className="mt-2 text-2xl font-semibold">{tenantName}</h1>
      )}
      <p className="mt-1 text-sm text-white/80">
        Scegli, dividi il conto e ordina. Senza attese.
      </p>
    </div>
  );
}

function CategoryNav({ categories, activeId, onSelect }: CategoryNavProps) {
  return (
    <div className="sticky top-0 z-20 -mx-4 mt-4 border-b border-neutral-100 bg-white/85 px-4 py-2.5 backdrop-blur">
      <div className="scroll-x flex gap-2">
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={
              "min-h-11 whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-medium transition " +
              (activeId === c.id
                ? "bg-[var(--brand)] text-[var(--brand-on)]"
                : "bg-neutral-100 text-neutral-700")
            }
          >
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function CategorySection({ category, children }: CategorySectionProps) {
  return (
    <section id={"cat-" + category.id} className="scroll-mt-16">
      <h2 className="mb-3 text-lg font-semibold">{category.name}</h2>
      {category.products.length === 0 && (
        <p className="rounded-xl border border-dashed bd px-4 py-3 text-sm text-neutral-500">
          Nessuna proposta in questa categoria, per ora.
        </p>
      )}
      <div className="space-y-3">{children}</div>
    </section>
  );
}

// La card e' la riga da scorrere, non la scheda del prodotto: foto piccola,
// nome, due righe di descrizione. Ingredienti e allergeni per esteso stanno nel
// dettaglio — in lista erano un muro di pastigliette in cui non si legge nulla.
//
// Il tocco e' diviso: la parte scritta apre il dettaglio, il "+" aggiunge e
// basta. Una card tutta cliccabile con dentro un bottone da 44px, sul telefono,
// e' un ordine partito per sbaglio.
function ProductCard({ product: p, priceLabel, onAdd, onOpen }: ProductCardProps) {
  return (
    <div className="flex gap-3 rounded-2xl border border-neutral-100 bg-white p-3 shadow-sm">
      <button
        onClick={onOpen}
        aria-label={"Vedi " + p.name}
        className="flex min-w-0 flex-1 gap-3 text-left transition active:opacity-70"
      >
        {/* Dentro a un bottone ci va solo testo: div e p qui non sono ammessi,
            e span con le stesse classi rendono uguale. */}
        <span
          className="block h-20 w-20 shrink-0 overflow-hidden rounded-xl"
          style={p.imageUrl ? undefined : { background: placeholder(p.name) }}
        >
          {p.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span
              className="flex h-full w-full items-center justify-center text-2xl font-semibold"
              style={{ color: "var(--brand-text)" }}
            >
              {p.name.charAt(0).toUpperCase()}
            </span>
          )}
        </span>

        <span className="block min-w-0 flex-1">
          <span className="block font-semibold leading-tight">
            {p.name}
            {p.acceptsNote && (
              <span
                className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ background: "var(--brand-50)", color: "var(--brand-text)" }}
              >
                su richiesta
              </span>
            )}
          </span>
          {p.description && (
            <span className="mt-0.5 line-clamp-2 block text-sm text-neutral-500">
              {p.description}
            </span>
          )}
          {/* Gli allergeni sono l'unica cosa che non puo' sparire in silenzio:
              la card non li elenca piu', ma deve dire che ci sono e che si
              leggono di la'. */}
          {p.allergens.length > 0 && (
            <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-neutral-400">
              <IconaInfo />
              allergeni
            </span>
          )}
        </span>
      </button>

      <div className="flex flex-col items-end justify-between">
        <span className="whitespace-nowrap font-semibold">{priceLabel}</span>
        {p.available ? (
          <button
            onClick={onAdd}
            aria-label={"Aggiungi " + p.name}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--brand)] text-2xl leading-none text-[var(--brand-on)] shadow-sm transition active:scale-95"
          >
            +
          </button>
        ) : (
          <span className="text-[11px] font-medium text-neutral-400">Esaurito</span>
        )}
      </div>
    </div>
  );
}

function IconaInfo() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

// Il dettaglio: qui il prodotto ha lo spazio che in lista non puo' avere.
// Foto grande, descrizione intera, ingredienti e allergeni scritti in modo che
// si leggano davvero, e in fondo il modo di ordinarlo.
function ProductSheet({ product: p, priceLabel, onAdd, onClose }: ProductSheetProps) {
  const usable = p.variants.filter((v) => v.available);

  return (
    <div className="flex max-h-[88vh] flex-col overflow-hidden rounded-t-3xl bg-white">
      <div className="overflow-y-auto">
        {/* Senza foto la testata si abbassa: mezzo schermo di segnaposto, per
            un rum servito allo shot, e' spazio buttato prima del prezzo. */}
        <div
          className={
            "relative w-full " + (p.imageUrl ? "aspect-[4/3]" : "h-28")
          }
          style={p.imageUrl ? undefined : { background: placeholder(p.name) }}
        >
          {p.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center text-4xl font-semibold"
              style={{ color: "var(--brand-text)" }}
            >
              {p.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="absolute inset-x-0 top-2 flex justify-center">
            <div className="h-1 w-10 rounded-full bg-white/70" />
          </div>
          <button
            onClick={onClose}
            aria-label="Chiudi"
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/85 text-neutral-700 shadow-sm backdrop-blur"
          >
            ✕
          </button>
        </div>

        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-xl font-semibold leading-tight">{p.name}</h2>
            <span className="whitespace-nowrap text-lg font-semibold">
              {priceLabel}
            </span>
          </div>

          {(p.acceptsNote || p.requiresGlasses) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {p.acceptsNote && (
                <span
                  className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                  style={{ background: "var(--brand-50)", color: "var(--brand-text)" }}
                >
                  su richiesta
                </span>
              )}
              {p.requiresGlasses && (
                <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-600">
                  si serve in bottiglia
                </span>
              )}
            </div>
          )}

          {p.description && (
            <p className="mt-3 text-[15px] leading-relaxed text-neutral-600">
              {p.description}
            </p>
          )}

          {p.ingredients.length > 0 && (
            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Ingredienti
              </h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-neutral-700">
                {p.ingredients.join(", ")}
              </p>
            </div>
          )}

          {p.allergens.length > 0 && (
            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Allergeni
              </h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {p.allergens.map((a) => (
                  <span
                    key={a}
                    className="rounded-full bg-neutral-100 px-3 py-1.5 text-sm text-neutral-700"
                  >
                    {a}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs text-neutral-500">
                Se hai un&apos;allergia o un&apos;intolleranza dillo allo staff:
                in cucina e al banco si lavora anche con altri ingredienti.
              </p>
            </div>
          )}

          {usable.length > 0 && (
            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Scegli il formato
              </h3>
              <div className="mt-2 space-y-2">
                {usable.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => onAdd(v)}
                    className="flex min-h-14 w-full items-center justify-between rounded-xl border border-neutral-200 px-4 py-3 text-left"
                  >
                    <span className="font-medium">{v.name}</span>
                    <span className="font-semibold">{formatPrice(v.priceCents)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fuori dalla parte che scorre: con una foto grande in cima, un pulsante
          in fondo al contenuto si vedrebbe solo scorrendo fino in fondo. */}
      <div className="border-t border-neutral-100 p-4 pb-6">
        {!p.available ? (
          <div className="rounded-xl bg-neutral-100 px-4 py-3 text-center text-sm font-medium text-neutral-500">
            Esaurito per oggi
          </div>
        ) : usable.length > 0 ? (
          <p className="text-center text-sm text-neutral-500">
            Tocca il formato che vuoi.
          </p>
        ) : (
          <button
            onClick={() => onAdd()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-3.5 font-medium text-[var(--brand-on)] transition active:scale-[0.99]"
          >
            {p.acceptsNote ? (
              "Scrivi la tua richiesta"
            ) : (
              <>
                Aggiungi
                <span className="opacity-70">·</span>
                {priceLabel}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export const baseSkin: Skin = {
  key: "base",
  label: "Base",
  description: "Lista sobria e leggibile. Adatta a qualsiasi locale.",
  Hero,
  CategoryNav,
  CategorySection,
  ProductCard,
  ProductSheet,
};

export { formatPrice };
