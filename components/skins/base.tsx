"use client";

import { formatPrice } from "@/lib/format";
import type {
  CategoryNavProps,
  CategorySectionProps,
  HeroProps,
  ProductCardProps,
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

function ProductCard({ product: p, priceLabel, onAdd }: ProductCardProps) {
  return (
    <div className="flex gap-3 rounded-2xl border border-neutral-100 bg-white p-3 shadow-sm">
      <div
        className="h-20 w-20 shrink-0 overflow-hidden rounded-xl"
        style={p.imageUrl ? undefined : { background: placeholder(p.name) }}
      >
        {p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-2xl font-semibold"
            style={{ color: "var(--brand-text)" }}
          >
            {p.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="font-semibold leading-tight">{p.name}</div>
        {p.description && (
          <div className="mt-0.5 line-clamp-2 text-sm text-neutral-500">
            {p.description}
          </div>
        )}
        {p.ingredients.length > 0 && (
          <div className="mt-0.5 text-xs text-neutral-400">
            {p.ingredients.join(" · ")}
          </div>
        )}
        {p.allergens.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {p.allergens.map((a) => (
              <span
                key={a}
                className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-500"
              >
                {a}
              </span>
            ))}
          </div>
        )}
      </div>

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

export const baseSkin: Skin = {
  key: "base",
  label: "Base",
  description: "Lista sobria e leggibile. Adatta a qualsiasi locale.",
  Hero,
  CategoryNav,
  CategorySection,
  ProductCard,
};

export { formatPrice };
