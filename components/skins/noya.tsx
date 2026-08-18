"use client";

import { useEffect, useRef, useState } from "react";
import { formatPrice } from "@/lib/format";
import type {
  CategoryNavProps,
  CategorySectionProps,
  HeroProps,
  ProductCardProps,
  ProductSheetProps,
  Skin,
} from "./types";

// Skin su misura per Noya Lounge Bar.
//
// Il locale ha un'identita' rigorosamente in bianco e nero: il nero resta la
// base, il colore entra solo come accento, uno per categoria. L'idea e' la
// vetrina di un bancone al buio, dove ogni sezione ha la sua luce.
//
// Qui c'e' solo presentazione: carrello, prezzi e invio ordine restano in
// OrderClient, identici a ogni altro locale.

// Accenti caldi e profondi, pensati per reggere su nero senza sembrare
// un menu per bambini. Si ripetono ciclicamente sulle categorie.
const ACCENTS = [
  "#E8B14C", // oro
  "#E2725B", // rame
  "#C9556F", // rosa scuro
  "#8E6FA8", // prugna
  "#4E93A6", // ottanio
  "#6FA88C", // salvia
];

function accentOf(index: number): string {
  return ACCENTS[index % ACCENTS.length];
}

// ---------------------------------------------------------------------------
// Un solo IntersectionObserver per tutta la pagina: con 150 prodotti crearne
// uno per card farebbe scattare il ventilatore del telefono.
// ---------------------------------------------------------------------------

let sharedObserver: IntersectionObserver | null = null;
const revealCallbacks = new WeakMap<Element, () => void>();

function getObserver(): IntersectionObserver | null {
  if (typeof window === "undefined" || !("IntersectionObserver" in window))
    return null;
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          revealCallbacks.get(entry.target)?.();
          sharedObserver?.unobserve(entry.target);
          revealCallbacks.delete(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.06 }
    );
  }
  return sharedObserver;
}

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = getObserver();
    // Senza IntersectionObserver si mostra tutto subito, niente contenuto
    // invisibile.
    if (!obs) {
      setShown(true);
      return;
    }
    revealCallbacks.set(el, () => setShown(true));
    obs.observe(el);
    return () => {
      obs.unobserve(el);
      revealCallbacks.delete(el);
    };
  }, []);

  return { ref, shown };
}

// ---------------------------------------------------------------------------

function Hero({ tenantName, logoUrl, tableNumber }: HeroProps) {
  return (
    <div className="noya-hero">
      <div className="noya-hero-glow" aria-hidden="true" />
      <div className="noya-hero-inner">
        <div className="noya-hero-top">
          <span className="noya-eyebrow">Ordina al tavolo</span>
          <span className="noya-table">Tavolo {tableNumber}</span>
        </div>

        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={tenantName} className="noya-logo" />
        ) : (
          <h1 className="noya-wordmark">{tenantName}</h1>
        )}

        <div className="noya-rule" aria-hidden="true" />
        <p className="noya-claim">
          Scegli, dividi il conto e ordina. Senza attese.
        </p>
      </div>
    </div>
  );
}

function CategoryNav({ categories, activeId, onSelect }: CategoryNavProps) {
  const barRef = useRef<HTMLDivElement>(null);

  // La pillola attiva si porta sempre sotto gli occhi mentre si scorre.
  useEffect(() => {
    if (!activeId || !barRef.current) return;
    const el = barRef.current.querySelector<HTMLElement>(
      `[data-cat="${activeId}"]`
    );
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeId]);

  return (
    <div className="noya-nav">
      <div className="noya-nav-track" ref={barRef}>
        {categories.map((c, i) => {
          const active = activeId === c.id;
          return (
            <button
              key={c.id}
              data-cat={c.id}
              onClick={() => onSelect(c.id)}
              aria-current={active}
              className={"noya-pill" + (active ? " is-active" : "")}
              style={{ ["--accent" as string]: accentOf(i) }}
            >
              {c.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CategorySection({ category, index, children }: CategorySectionProps) {
  const { ref, shown } = useReveal<HTMLElement>();
  const accent = accentOf(index);

  return (
    <section
      id={"cat-" + category.id}
      ref={ref}
      className={"noya-section" + (shown ? " is-in" : "")}
      style={{ ["--accent" as string]: accent }}
    >
      <header className="noya-section-head">
        <h2 className="noya-section-title">{category.name}</h2>
        <span className="noya-section-rule" aria-hidden="true" />
      </header>

      {category.products.length === 0 && (
        <p className="noya-empty">Nessuna proposta in questa categoria, per ora.</p>
      )}

      <div className="noya-grid">{children}</div>
    </section>
  );
}

function ProductCard({
  product: p,
  index,
  categoryIndex,
  priceLabel,
  onAdd,
  onOpen,
}: ProductCardProps) {
  const { ref, shown } = useReveal<HTMLDivElement>();
  const accent = accentOf(categoryIndex);

  return (
    <article
      ref={ref}
      className={
        "noya-card" +
        (shown ? " is-in" : "") +
        (p.available ? "" : " is-out") +
        // Distillati e vini: solo nome e prezzo, la card si stringe.
        (!p.description ? " is-compact" : "")
      }
      style={{
        ["--accent" as string]: accent,
        // Sfalsamento a cascata, ma solo per le prime della sezione: oltre
        // diventerebbe un'attesa, non un effetto.
        transitionDelay: `${Math.min(index, 5) * 55}ms`,
      }}
    >
      {/* Si apre toccando la parte scritta, non tutta la card: il "+" e' li'
          accanto, e a un dito su un telefono i due tocchi si somigliano
          troppo. */}
      <button className="noya-open" onClick={onOpen} aria-label={"Vedi " + p.name}>
        <span className="noya-thumb">
          {p.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.imageUrl} alt="" />
          ) : (
            <span className="noya-initial" aria-hidden="true">
              {p.name.charAt(0).toUpperCase()}
            </span>
          )}
        </span>

        <span className="noya-body">
          <span className="noya-name">
            {p.name}
            {p.acceptsNote && <span className="noya-surichiesta">su richiesta</span>}
          </span>
          {p.description && <span className="noya-desc">{p.description}</span>}
          {/* Gli allergeni non si elencano piu' in lista — erano coriandoli
              illeggibili — ma sparire in silenzio non possono: la card dice
              che ci sono, il dettaglio li scrive. */}
          {p.allergens.length > 0 && (
            <span className="noya-allergen-hint">allergeni</span>
          )}
        </span>
      </button>

      <div className="noya-side">
        <span className="noya-price">{priceLabel}</span>
        {p.available ? (
          <button onClick={onAdd} aria-label={"Aggiungi " + p.name} className="noya-add">
            <span aria-hidden="true">+</span>
          </button>
        ) : (
          <span className="noya-sold">Esaurito</span>
        )}
      </div>
    </article>
  );
}

// Il dettaglio: la vetrina al buio si apre e il prodotto ha finalmente la sua
// luce. Foto a tutta larghezza che sfuma nel nero, e sotto tutto quello che in
// lista non ci stava.
function ProductSheet({
  product: p,
  categoryIndex,
  priceLabel,
  onAdd,
  onClose,
}: ProductSheetProps) {
  const accent = accentOf(categoryIndex);
  const usable = p.variants.filter((v) => v.available);

  return (
    <div className="noya-sheet" style={{ ["--accent" as string]: accent }}>
      <div className="noya-sheet-scroll">
        {/* Senza foto la testata si abbassa: mezzo schermo di segnaposto, per
            un rum servito allo shot, e' spazio buttato prima del prezzo. */}
        <div className={"noya-sheet-photo" + (p.imageUrl ? "" : " is-empty")}>
          {p.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.imageUrl} alt="" />
          ) : (
            <span className="noya-sheet-initial" aria-hidden="true">
              {p.name.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="noya-sheet-fade" aria-hidden="true" />
          <span className="noya-sheet-grip" aria-hidden="true" />
          <button className="noya-sheet-close" onClick={onClose} aria-label="Chiudi">
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        <div className="noya-sheet-body">
          <div className="noya-sheet-head">
            <h2 className="noya-sheet-name">{p.name}</h2>
            <span className="noya-sheet-price">{priceLabel}</span>
          </div>

          {(p.acceptsNote || p.requiresGlasses) && (
            <div className="noya-sheet-badges">
              {p.acceptsNote && <span className="noya-surichiesta">su richiesta</span>}
              {p.requiresGlasses && (
                <span className="noya-surichiesta">in bottiglia</span>
              )}
            </div>
          )}

          {p.description && <p className="noya-sheet-desc">{p.description}</p>}

          {p.ingredients.length > 0 && (
            <section className="noya-sheet-block">
              <h3 className="noya-sheet-label">Ingredienti</h3>
              <p className="noya-sheet-text">{p.ingredients.join(", ")}</p>
            </section>
          )}

          {p.allergens.length > 0 && (
            <section className="noya-sheet-block">
              <h3 className="noya-sheet-label">Allergeni</h3>
              <div className="noya-sheet-chips">
                {p.allergens.map((a) => (
                  <span key={a}>{a}</span>
                ))}
              </div>
              <p className="noya-sheet-nota">
                Se hai un&apos;allergia o un&apos;intolleranza dillo allo staff: al
                banco si lavora anche con altri ingredienti.
              </p>
            </section>
          )}

          {usable.length > 0 && (
            <section className="noya-sheet-block">
              <h3 className="noya-sheet-label">Scegli il formato</h3>
              <div className="noya-variants">
                {usable.map((v) => (
                  <button key={v.id} className="noya-variant" onClick={() => onAdd(v)}>
                    <span>{v.name}</span>
                    <span className="noya-variant-price">{formatPrice(v.priceCents)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Fuori dalla parte che scorre: con la foto in cima, un pulsante dentro
          al contenuto si vedrebbe solo arrivando in fondo. */}
      <div className="noya-sheet-foot">
        {!p.available ? (
          <span className="noya-sheet-out">Esaurito per stasera</span>
        ) : usable.length > 0 ? (
          <span className="noya-sheet-hint">Tocca il formato che vuoi.</span>
        ) : (
          <button className="noya-cta" onClick={() => onAdd()}>
            {p.acceptsNote ? "Scrivi la tua richiesta" : `Aggiungi · ${priceLabel}`}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

const css = `
.noya-root {
  position: relative;
  --noya-ink: #ffffff;
  --noya-dim: rgba(255, 255, 255, 0.58);
}

/* Aurora fissa dietro al menu: il colore c'e', ma non compete col nero. */
.noya-root::before {
  content: "";
  position: fixed;
  inset: -20vh -20vw;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(38vw 38vw at 12% 8%, rgba(232, 177, 76, 0.16), transparent 62%),
    radial-gradient(34vw 34vw at 88% 26%, rgba(201, 85, 111, 0.14), transparent 64%),
    radial-gradient(40vw 40vw at 50% 92%, rgba(155, 123, 216, 0.13), transparent 66%);
  filter: blur(12px);
  animation: noya-drift 26s ease-in-out infinite alternate;
}

@keyframes noya-drift {
  from { transform: translate3d(-2%, -1%, 0) scale(1); }
  to   { transform: translate3d(2%, 3%, 0) scale(1.08); }
}

/* ---- Testata ---- */

.noya-hero {
  position: relative;
  overflow: hidden;
  border-radius: 26px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  background: linear-gradient(168deg, #141414 0%, #000000 72%);
  padding: 26px 22px 22px;
}

.noya-hero-glow {
  position: absolute;
  inset: -60% -20% auto -20%;
  height: 150%;
  background: radial-gradient(50% 50% at 50% 0%, rgba(232, 177, 76, 0.22), transparent 70%);
  animation: noya-breathe 7s ease-in-out infinite alternate;
}

@keyframes noya-breathe {
  from { opacity: 0.55; }
  to   { opacity: 1; }
}

.noya-hero-inner { position: relative; }

.noya-hero-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.noya-eyebrow {
  font-size: 10px;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: rgba(232, 177, 76, 0.85);
}

.noya-table {
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  padding: 5px 12px;
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--noya-ink);
}

.noya-logo {
  display: block;
  height: 68px;
  width: auto;
  max-width: 78%;
  object-fit: contain;
  object-position: left;
  margin: 22px 0 18px;
}

.noya-wordmark {
  margin: 20px 0 16px;
  font-size: 30px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--noya-ink);
}

.noya-rule {
  height: 1px;
  background: linear-gradient(90deg, rgba(232, 177, 76, 0.9), rgba(255, 255, 255, 0.06));
  transform-origin: left;
  animation: noya-rule-in 1.1s cubic-bezier(0.2, 0.7, 0.2, 1) both;
}

@keyframes noya-rule-in {
  from { transform: scaleX(0); }
  to   { transform: scaleX(1); }
}

.noya-claim {
  margin-top: 12px;
  font-size: 13px;
  color: var(--noya-dim);
}

/* ---- Navigazione categorie ---- */

.noya-nav {
  position: sticky;
  top: 0;
  z-index: 20;
  margin: 18px -16px 0;
  padding: 10px 16px;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.92), rgba(0, 0, 0, 0.72));
  backdrop-filter: blur(14px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}

.noya-nav-track {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
}
.noya-nav-track::-webkit-scrollbar { display: none; }

.noya-pill {
  flex: 0 0 auto;
  min-height: 44px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  padding: 0 16px;
  font-size: 13px;
  letter-spacing: 0.04em;
  color: var(--noya-dim);
  transition: color 0.25s, border-color 0.25s, background 0.25s, transform 0.25s;
}

.noya-pill.is-active {
  color: #0a0a0a;
  background: var(--accent);
  border-color: var(--accent);
  transform: translateY(-1px);
}

/* ---- Sezione ---- */

.noya-section {
  scroll-margin-top: 76px;
  opacity: 0;
  transform: translateY(18px);
  transition: opacity 0.5s ease, transform 0.6s cubic-bezier(0.2, 0.7, 0.2, 1);
}
.noya-section.is-in { opacity: 1; transform: none; }

.noya-section-head { margin-bottom: 14px; }

.noya-section-title {
  font-size: 21px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--noya-ink);
}

.noya-section-rule {
  display: block;
  height: 2px;
  width: 46px;
  margin-top: 9px;
  border-radius: 2px;
  background: var(--accent);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.7s cubic-bezier(0.2, 0.7, 0.2, 1) 0.12s;
}
.noya-section.is-in .noya-section-rule { transform: scaleX(1); }

.noya-empty {
  border: 1px dashed rgba(255, 255, 255, 0.14);
  border-radius: 14px;
  padding: 14px 16px;
  font-size: 13px;
  color: var(--noya-dim);
}

.noya-grid { display: flex; flex-direction: column; gap: 12px; }

/* ---- Card prodotto: il rilievo 3D entra qui ---- */

.noya-card {
  display: flex;
  gap: 14px;
  align-items: stretch;
  position: relative;
  overflow: hidden;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background:
    linear-gradient(158deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.02));
  padding: 12px;
  opacity: 0;
  transform: perspective(1000px) rotateX(12deg) translateY(26px) scale(0.97);
  transform-origin: 50% 100%;
  transition:
    opacity 0.55s ease,
    transform 0.7s cubic-bezier(0.2, 0.7, 0.2, 1),
    border-color 0.3s ease;
}

.noya-card.is-in { opacity: 1; transform: none; }
.noya-card.is-out { opacity: 0.45; }

/* Voci senza descrizione: riga bassa e compatta, come una lista di bancone. */
.noya-card.is-compact { align-items: center; padding: 10px 12px; }
.noya-card.is-compact .noya-thumb { height: 62px; width: 62px; border-radius: 13px; }
.noya-card.is-compact .noya-initial { font-size: 22px; }
.noya-card.is-compact .noya-side { flex-direction: row; align-items: center; gap: 14px; }
.noya-card.is-compact .noya-add { height: 40px; width: 40px; font-size: 21px; }

/* Alone della categoria nell'angolo alto della card. */
.noya-card::after {
  content: "";
  position: absolute;
  inset: -40% 40% 60% -20%;
  background: radial-gradient(50% 50% at 30% 40%, var(--accent), transparent 70%);
  opacity: 0.15;
  pointer-events: none;
}

.noya-card:active { border-color: color-mix(in srgb, var(--accent) 55%, transparent); }

/* La zona che apre il dettaglio: foto e testo. Il prezzo e il "+" restano
   fuori, sono un'altra cosa. */
.noya-open {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  gap: 14px;
  align-items: stretch;
  text-align: left;
  transition: opacity 0.2s ease;
}

.noya-open:active { opacity: 0.72; }

.noya-card.is-compact .noya-open { align-items: center; }

.noya-thumb {
  position: relative;
  height: 92px;
  width: 92px;
  flex: 0 0 auto;
  overflow: hidden;
  border-radius: 15px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background:
    radial-gradient(70% 70% at 30% 25%, color-mix(in srgb, var(--accent) 42%, transparent), transparent 72%),
    #0c0c0c;
  display: flex;
  align-items: center;
  justify-content: center;
}

.noya-thumb img { height: 100%; width: 100%; object-fit: cover; }

.noya-initial {
  font-size: 30px;
  font-weight: 300;
  letter-spacing: 0.06em;
  color: color-mix(in srgb, var(--accent) 82%, #ffffff);
}

.noya-body { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 4px; }

/* Distillati e vini spesso non hanno descrizione: il nome da solo va
   centrato, altrimenti la card sembra sbilanciata in alto. */
.noya-body:has(> .noya-name:only-child) { justify-content: center; }

.noya-name {
  display: block;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.25;
  color: var(--noya-ink);
}

.noya-surichiesta {
  margin-left: 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--accent) 75%, #ffffff);
  white-space: nowrap;
}

.noya-desc {
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--noya-dim);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Un cenno, non un elenco: dice che c'e' da leggere, il resto sta nel foglio. */
.noya-allergen-hint {
  display: inline-block;
  width: fit-content;
  margin-top: 2px;
  border-bottom: 1px dotted rgba(255, 255, 255, 0.28);
  font-size: 10.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.42);
}

.noya-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px;
  flex: 0 0 auto;
}

.noya-price {
  white-space: nowrap;
  font-size: 14px;
  font-weight: 600;
  color: color-mix(in srgb, var(--accent) 70%, #ffffff);
}

.noya-add {
  height: 44px;
  width: 44px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  line-height: 1;
  color: #0a0a0a;
  background: var(--accent);
  box-shadow: 0 6px 18px -6px var(--accent);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.noya-add:active { transform: scale(0.92); }

.noya-sold {
  font-size: 11px;
  letter-spacing: 0.06em;
  color: rgba(255, 255, 255, 0.38);
}

/* ---- Dettaglio del prodotto ---- */

.noya-sheet {
  display: flex;
  flex-direction: column;
  max-height: 88vh;
  overflow: hidden;
  border-radius: 26px 26px 0 0;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-bottom: none;
  background: linear-gradient(178deg, #121212 0%, #000000 62%);
  color: var(--noya-ink);
  animation: noya-sheet-in 0.32s cubic-bezier(0.2, 0.7, 0.2, 1) both;
}

@keyframes noya-sheet-in {
  from { transform: translateY(22px); opacity: 0; }
  to   { transform: none; opacity: 1; }
}

.noya-sheet-scroll { overflow-y: auto; overscroll-behavior: contain; }

.noya-sheet-photo {
  position: relative;
  aspect-ratio: 4 / 3;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(60% 60% at 50% 35%, color-mix(in srgb, var(--accent) 34%, transparent), transparent 70%),
    #0c0c0c;
}

.noya-sheet-photo.is-empty { aspect-ratio: auto; height: 118px; }
.noya-sheet-photo.is-empty .noya-sheet-initial { font-size: 46px; }

.noya-sheet-photo img { height: 100%; width: 100%; object-fit: cover; }

.noya-sheet-initial {
  font-size: 84px;
  font-weight: 300;
  letter-spacing: 0.06em;
  color: color-mix(in srgb, var(--accent) 80%, #ffffff);
}

/* La foto non finisce con una riga netta: sfuma nel nero del pannello, come
   una vetrina che si spegne verso il basso. */
.noya-sheet-fade {
  position: absolute;
  inset: auto 0 -1px 0;
  height: 45%;
  background: linear-gradient(180deg, transparent, #050505 92%);
  pointer-events: none;
}

.noya-sheet-grip {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  height: 4px;
  width: 42px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.55);
}

.noya-sheet-close {
  position: absolute;
  top: 10px;
  right: 12px;
  height: 38px;
  width: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
  font-size: 15px;
  color: rgba(255, 255, 255, 0.85);
}

.noya-sheet-body { padding: 4px 20px 22px; }

.noya-sheet-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
}

.noya-sheet-name {
  font-size: 21px;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: 0.02em;
  color: var(--noya-ink);
}

.noya-sheet-price {
  white-space: nowrap;
  font-size: 17px;
  font-weight: 600;
  color: color-mix(in srgb, var(--accent) 72%, #ffffff);
}

.noya-sheet-badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.noya-sheet-badges .noya-surichiesta { margin-left: 0; }

.noya-sheet-desc {
  margin-top: 12px;
  font-size: 14.5px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.72);
}

.noya-sheet-block { margin-top: 22px; }

.noya-sheet-label {
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--accent) 62%, #ffffff);
}

.noya-sheet-text {
  margin-top: 7px;
  font-size: 14.5px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.78);
}

/* Qui gli allergeni si leggono davvero: e' il motivo per cui il foglio esiste. */
.noya-sheet-chips { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 9px; }

.noya-sheet-chips span {
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.05);
  padding: 7px 14px;
  font-size: 13.5px;
  color: rgba(255, 255, 255, 0.86);
}

.noya-sheet-nota {
  margin-top: 10px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--noya-dim);
}

.noya-variants { display: flex; flex-direction: column; gap: 8px; margin-top: 9px; }

.noya-variant {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 56px;
  border-radius: 15px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  padding: 0 16px;
  font-size: 14.5px;
  text-align: left;
  color: var(--noya-ink);
  transition: border-color 0.2s ease, background 0.2s ease;
}

.noya-variant:active {
  border-color: color-mix(in srgb, var(--accent) 60%, transparent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.noya-variant-price {
  white-space: nowrap;
  font-weight: 600;
  color: color-mix(in srgb, var(--accent) 70%, #ffffff);
}

.noya-sheet-foot {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding: 14px 20px calc(18px + env(safe-area-inset-bottom));
  background: rgba(0, 0, 0, 0.4);
}

.noya-cta {
  width: 100%;
  min-height: 52px;
  border-radius: 15px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #0a0a0a;
  background: var(--accent);
  box-shadow: 0 10px 26px -12px var(--accent);
  transition: transform 0.2s ease;
}

.noya-cta:active { transform: scale(0.99); }

.noya-sheet-hint,
.noya-sheet-out {
  display: block;
  text-align: center;
  font-size: 13px;
  color: var(--noya-dim);
}

.noya-sheet-out { letter-spacing: 0.06em; text-transform: uppercase; }

/* Chi ha chiesto meno animazioni riceve la stessa pagina, ferma. */
@media (prefers-reduced-motion: reduce) {
  .noya-root::before,
  .noya-hero-glow { animation: none; }
  .noya-card,
  .noya-section { opacity: 1; transform: none; transition: none; }
  .noya-section-rule { transform: scaleX(1); transition: none; }
  .noya-rule { animation: none; }
  .noya-sheet { animation: none; }
}
`;

export const noyaSkin: Skin = {
  key: "noya",
  label: "Noya (lounge notturno)",
  description:
    "Nero profondo, un accento di colore per categoria, card con rilievo 3D allo scorrimento.",
  css,
  rootClassName: "noya-root",
  Hero,
  CategoryNav,
  CategorySection,
  ProductCard,
  ProductSheet,
};
