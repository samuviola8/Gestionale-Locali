"use client";

import { useEffect, useRef, useState } from "react";
import Select from "@/components/Select";
import { getSkin } from "@/components/skins";
import { formatPrice as fmt } from "@/lib/format";
import type {
  SkinCategory,
  SkinProduct,
  SkinVariant,
} from "@/components/skins/types";

// La presentazione del menu vive nelle skin (components/skins/): qui restano
// solo stato, carrello e invio dell'ordine, uguali per ogni locale.
type Product = SkinProduct;
type Variant = SkinVariant;
type Category = SkinCategory;
type CartItem = {
  productId: string;
  variantId: string | null;
  name: string;
  priceCents: number;
  qty: number;
  alias: string;
  // Cosa ha chiesto il cliente, per i prodotti su richiesta.
  note?: string;
};

// "da €3,00" quando il prodotto ha piu' formati.
function priceLabel(p: Product): string {
  const usable = p.variants.filter((v) => v.available);
  if (!usable.length) return fmt(p.priceCents);
  const min = Math.min(...usable.map((v) => v.priceCents));
  const max = Math.max(...usable.map((v) => v.priceCents));
  return min === max ? fmt(min) : `da ${fmt(min)}`;
}

export default function OrderClient({
  tenantName,
  logoUrl,
  menu,
  tableNumber,
  splitBill,
  waiterCall,
  skinKey,
  submitOrder,
  callWaiter,
}: {
  tenantName: string;
  logoUrl: string | null;
  menu: Category[];
  tableNumber: number;
  skinKey: string;
  splitBill: boolean;
  waiterCall: boolean;
  submitOrder: (
    tableNumber: number,
    items: {
      productId: string;
      variantId?: string | null;
      alias: string;
      quantity: number;
      note?: string;
    }[],
    partySize?: number
  ) => Promise<{ ok: boolean }>;
  callWaiter: (tableNumber: number) => Promise<{ ok: boolean }>;
}) {
  // Senza sotto-conti non ha senso chiedere il nome: tutto va sul tavolo.
  const [nameStep, setNameStep] = useState(splitBill);
  const [nameInput, setNameInput] = useState("");
  const [people, setPeople] = useState<string[]>(
    splitBill ? ["Io", "Condiviso"] : ["Tavolo"]
  );
  const [active, setActive] = useState(splitBill ? "Io" : "Tavolo");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [calling, setCalling] = useState(false);
  const [waiterPending, setWaiterPending] = useState(false);
  // Prodotto per cui e' aperta la scelta del formato.
  const [variantFor, setVariantFor] = useState<Product | null>(null);
  // Prodotto su richiesta in attesa che il cliente scriva cosa desidera.
  const [noteFor, setNoteFor] = useState<Product | null>(null);
  const [noteText, setNoteText] = useState("");
  // Campo in linea per aggiungere una persona al conto.
  const [addingPerson, setAddingPerson] = useState(false);
  const [newPerson, setNewPerson] = useState("");
  // Quante persone sono sedute: si chiede alla prima consumazione condivisa,
  // perche' e' li' che serve per dividerla. Prodotto in attesa nel frattempo.
  const [partySize, setPartySize] = useState<number | null>(null);
  const [askingParty, setAskingParty] = useState<
    { p: Product; v?: Variant } | null
  >(null);
  // Categoria sotto l'occhio dell'utente, per evidenziarla nella navigazione.
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  // Quando si salta a una categoria, lo scroll-spy tace finche' non si arriva.
  const jumpingTo = useRef<string | null>(null);

  const Skin = getSkin(skinKey);

  function confirmName() {
    const n = nameInput.trim();
    if (n) {
      setPeople([n, "Condiviso"]);
      setActive(n);
    }
    setNameStep(false);
  }

  // Niente window.prompt: e' bloccato in diversi browser (e nel pannello di
  // anteprima) e su un telefono al tavolo e' comunque un dialogo di sistema
  // fuori posto. Il nome si scrive in linea, tra le persone gia' presenti.
  function addPerson() {
    const n = newPerson.trim();
    if (n && !people.includes(n)) {
      // "Condiviso" resta sempre l'ultima voce.
      setPeople([...people.slice(0, -1), n, "Condiviso"]);
      setActive(n);
    }
    setNewPerson("");
    setAddingPerson(false);
  }

  // Un prodotto con piu' formati apre prima la scelta del formato.
  // `personeGiaChieste` evita un ciclo: setPartySize non e' immediato, quindi
  // rientrando qui subito dopo la scelta si rivedrebbe ancora null.
  function add(
    p: Product,
    v?: Variant,
    personeGiaChieste = false,
    nota?: string
  ) {
    const usable = p.variants.filter((x) => x.available);
    if (!v && usable.length) {
      setVariantFor(p);
      return;
    }
    setVariantFor(null);

    // Prodotto su richiesta: prima si scrive cosa si desidera.
    if (p.acceptsNote && nota === undefined) {
      setNoteText("");
      setNoteFor(p);
      return;
    }

    // Prima consumazione condivisa: senza sapere in quanti siete non si puo'
    // dividere. Si chiede una volta sola, poi il prodotto entra nel carrello.
    if (
      splitBill &&
      active === "Condiviso" &&
      partySize === null &&
      !personeGiaChieste
    ) {
      setAskingParty({ p, v });
      return;
    }
    setCart((prev) => {
      // Due richieste diverse non si sommano mai: sono due drink diversi.
      const i = nota
        ? -1
        : prev.findIndex(
            (c) =>
              c.productId === p.id &&
              c.variantId === (v?.id ?? null) &&
              c.alias === active &&
              !c.note
          );
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: next[i].qty + 1 };
        return next;
      }
      return [
        ...prev,
        {
          productId: p.id,
          variantId: v?.id ?? null,
          name: v ? `${p.name} — ${v.name}` : p.name,
          priceCents: v ? v.priceCents : p.priceCents,
          qty: 1,
          alias: active,
          note: nota?.trim() || undefined,
        },
      ];
    });
  }

  function setQty(idx: number, delta: number) {
    setCart((prev) =>
      prev.flatMap((c, i) =>
        i === idx ? (c.qty + delta <= 0 ? [] : [{ ...c, qty: c.qty + delta }]) : [c]
      )
    );
  }

  function reassign(idx: number, alias: string) {
    setCart((prev) => prev.map((c, i) => (i === idx ? { ...c, alias } : c)));
  }

  function goTo(id: string) {
    jumpingTo.current = id;
    setActiveCategory(id);
    document.getElementById("cat-" + id)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  const count = cart.reduce((s, c) => s + c.qty, 0);
  const total = cart.reduce((s, c) => s + c.priceCents * c.qty, 0);

  // Carrello raggruppato per persona: senza, chi ordina non vede chi paga cosa
  // finche' non arriva il conto. Ogni riga tiene l'indice originale, perche' e'
  // quello che usano i pulsanti quantita' e lo spostamento tra persone.
  const righeCarrello: {
    c: CartItem;
    idx: number;
    intestazione: { alias: string; subtotale: number; primo: boolean } | null;
  }[] = [];

  if (splitBill) {
    // Si segue l'ordine delle pillole, cosi' "Condiviso" resta in fondo.
    const ordine = people.filter((p) => cart.some((c) => c.alias === p));
    const altri = [...new Set(cart.map((c) => c.alias))].filter(
      (a) => !ordine.includes(a)
    );
    [...ordine, ...altri].forEach((alias, i) => {
      const voci = cart
        .map((c, idx) => ({ c, idx }))
        .filter(({ c }) => c.alias === alias);
      const subtotale = voci.reduce((s, { c }) => s + c.priceCents * c.qty, 0);
      voci.forEach(({ c, idx }, j) => {
        righeCarrello.push({
          c,
          idx,
          intestazione: j === 0 ? { alias, subtotale, primo: i === 0 } : null,
        });
      });
    });
  } else {
    cart.forEach((c, idx) => righeCarrello.push({ c, idx, intestazione: null }));
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? menu
        .map((c) => ({
          ...c,
          products: c.products.filter((p) =>
            [
              p.name,
              p.description ?? "",
              ...p.ingredients,
              ...p.allergens,
              ...p.variants.map((v) => v.name),
            ]
              .join(" ")
              .toLowerCase()
              .includes(q)
          ),
        }))
        .filter((c) => c.products.length > 0)
    : menu;

  async function send() {
    if (!cart.length || sending) return;
    setSending(true);
    const res = await submitOrder(
      tableNumber,
      cart.map((c) => ({
        productId: c.productId,
        variantId: c.variantId,
        alias: c.alias,
        quantity: c.qty,
        note: c.note,
      })),
      partySize ?? undefined
    );
    setSending(false);
    if (res.ok) {
      setCart([]);
      setCartOpen(false);
      setSent(true);
    }
  }

  async function handleCall() {
    if (calling || waiterPending) return;
    setCalling(true);
    await callWaiter(tableNumber);
    setCalling(false);
    setWaiterPending(true);
  }

  // Elenco delle sezioni effettivamente a schermo: cambia con la ricerca e
  // quando si esce dallo step del nome. Serve come dipendenza dell'effetto,
  // altrimenti questo si aggancerebbe una volta sola, quando il menu non c'e'
  // ancora, e la navigazione resterebbe muta.
  const sectionKey = filtered.map((c) => c.id).join(",");

  // Segue la categoria in cima allo schermo mentre si scorre, cosi' la
  // navigazione resta sincronizzata col contenuto.
  useEffect(() => {
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>('[id^="cat-"]')
    );
    if (!sections.length) return;

    function onScroll() {
      // La soglia sta sotto la barra sticky: la categoria "corrente" e' quella
      // il cui inizio ha appena superato la navigazione.
      const line = 120;
      let current = sections[0];
      for (const el of sections) {
        if (el.getBoundingClientRect().top <= line) current = el;
      }
      const id = current.id.replace(/^cat-/, "");

      // Durante un salto si aspetta di essere arrivati, altrimenti le sezioni
      // attraversate farebbero lampeggiare la pillola attiva.
      if (jumpingTo.current) {
        if (jumpingTo.current === id) jumpingTo.current = null;
        return;
      }
      setActiveCategory(id);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [sectionKey, nameStep, sent]);

  // Stato condiviso della chiamata: tutti i telefoni del tavolo vedono lo stesso.
  useEffect(() => {
    if (!waiterCall) return;
    let active = true;
    async function loadCall() {
      try {
        const r = await fetch(`/api/table-call?table=${tableNumber}`, {
          cache: "no-store",
        });
        const d = await r.json();
        if (active) setWaiterPending(!!d.pending);
      } catch {
        // si riprova al prossimo giro
      }
    }
    loadCall();
    const t = setInterval(loadCall, 4000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [tableNumber, waiterCall]);

  let content: React.ReactNode;

  if (nameStep) {
    content = (
      <>
        <Skin.Hero tenantName={tenantName} logoUrl={logoUrl} tableNumber={tableNumber} />
        <div className="mt-5 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="text-lg font-semibold">Come ti chiami?</div>
          <p className="mt-1 text-sm text-neutral-500">
            Serve solo per dividere il conto. Puoi saltare.
          </p>
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirmName()}
            placeholder="Il tuo nome"
            className="mt-3 w-full rounded-xl border border-neutral-200 px-4 py-3"
          />
          <div className="mt-3 flex gap-2">
            <button
              onClick={confirmName}
              className="flex-1 rounded-xl bg-[var(--brand)] px-4 py-3 font-medium text-[var(--brand-on)]"
            >
              Continua
            </button>
            <button
              onClick={() => setNameStep(false)}
              className="rounded-xl border border-neutral-200 px-4 py-3 text-sm"
            >
              Salta
            </button>
          </div>
        </div>
      </>
    );
  } else if (sent) {
    content = (
      <>
        <Skin.Hero tenantName={tenantName} logoUrl={logoUrl} tableNumber={tableNumber} />
        <div className="mt-5 rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm">
          <div
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-2xl text-[var(--brand-on)]"
            style={{ background: "var(--brand)" }}
          >
            ✓
          </div>
          <div className="mt-3 text-lg font-semibold">Ordine inviato!</div>
          <p className="mt-1 text-sm text-neutral-500">
            Arriva subito allo staff. Pagherai alla cassa (tavolo {tableNumber}).
          </p>
          <button
            onClick={() => setSent(false)}
            className="mt-4 rounded-xl bg-[var(--brand)] px-5 py-2.5 font-medium text-[var(--brand-on)]"
          >
            Ordina ancora
          </button>
        </div>
      </>
    );
  } else {
    content = (
      <>
      <Skin.Hero tenantName={tenantName} logoUrl={logoUrl} tableNumber={tableNumber} />

      {waiterCall && (
      <button
        onClick={handleCall}
        disabled={calling || waiterPending}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border bd py-2.5 text-sm font-medium disabled:opacity-100"
        style={
          waiterPending
            ? { color: "var(--brand-text)", borderColor: "var(--brand)" }
            : undefined
        }
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {waiterPending
          ? "Cameriere in arrivo"
          : calling
            ? "Chiamo..."
            : "Chiama il cameriere"}
      </button>
      )}

      {splitBill && (
        <div className="mt-4">
          <div className="text-xs font-medium text-neutral-500">Aggiungi per</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {people.map((p) => (
              <button
                key={p}
                onClick={() => setActive(p)}
                aria-pressed={active === p}
                className={
                  "min-h-11 rounded-full px-4 py-2.5 text-sm font-medium transition " +
                  (active === p
                    ? "bg-[var(--brand)] text-[var(--brand-on)] shadow-sm"
                    : "border border-neutral-200 bg-white text-neutral-600")
                }
              >
                {p}
              </button>
            ))}
            {addingPerson ? (
              <span className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={newPerson}
                  onChange={(e) => setNewPerson(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addPerson();
                    if (e.key === "Escape") {
                      setNewPerson("");
                      setAddingPerson(false);
                    }
                  }}
                  placeholder="Nome"
                  aria-label="Nome della persona da aggiungere al conto"
                  maxLength={24}
                  className="min-h-11 w-28 rounded-full border border-neutral-200 bg-white px-4 text-sm"
                />
                <button
                  onClick={addPerson}
                  className="min-h-11 rounded-full bg-[var(--brand)] px-4 text-sm font-medium text-[var(--brand-on)]"
                >
                  Aggiungi
                </button>
              </span>
            ) : (
              <button
                onClick={() => setAddingPerson(true)}
                className="min-h-11 rounded-full border border-dashed border-neutral-300 px-4 py-2.5 text-sm text-neutral-500"
              >
                + persona
              </button>
            )}
          </div>
        </div>
      )}

      <div className="relative mt-4">
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#9ca3af"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="16.5" y1="16.5" x2="21" y2="21" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca piatto o ingrediente…"
          className="w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-10 pr-9 text-sm"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            aria-label="Pulisci ricerca"
            className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-neutral-400"
          >
            ✕
          </button>
        )}
      </div>

      {menu.length > 1 && !q && (
        <Skin.CategoryNav
          categories={menu}
          activeId={activeCategory}
          onSelect={goTo}
        />
      )}

      {q && filtered.length === 0 && (
        <p className="mt-6 text-center text-sm text-neutral-500">
          Nessun risultato per «{query}».
        </p>
      )}

      <div className="mt-5 space-y-9">
        {filtered.map((cat, ci) => (
          <Skin.CategorySection key={cat.id} category={cat} index={ci}>
            {cat.products.map((p, pi) => (
              <Skin.ProductCard
                key={p.id}
                product={p}
                index={pi}
                categoryIndex={ci}
                priceLabel={priceLabel(p)}
                onAdd={() => add(p)}
              />
            ))}
          </Skin.CategorySection>
        ))}
      </div>

      {noteFor && (
        <div
          className="fixed inset-0 z-40 flex items-end"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onClick={() => setNoteFor(null)}
        >
          <div
            className="mx-auto w-full max-w-md rounded-t-3xl bg-white p-4 pb-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-200" />
            <div className="text-lg font-semibold">{noteFor.name}</div>
            <p className="mt-1 text-sm text-neutral-500">
              Scrivi cosa ti va: un cocktail fuori menu, oppure com&apos;è che
              lo vorresti. Ci pensa il barman.
            </p>

            <textarea
              autoFocus
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={3}
              maxLength={200}
              placeholder="Qualcosa di amaro col vermut, non troppo dolce"
              aria-label={`Cosa desideri per ${noteFor.name}`}
              className="mt-3 w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm"
            />

            <div className="mt-1 flex items-center justify-between text-xs text-neutral-500">
              <span>
                {noteFor.priceCents > 0 && (
                  <>Prezzo di partenza {fmt(noteFor.priceCents)}</>
                )}
              </span>
              <span className="tabular-nums">{noteText.length}/200</span>
            </div>

            <button
              onClick={() => {
                const p = noteFor;
                setNoteFor(null);
                add(p, undefined, false, noteText);
              }}
              disabled={!noteText.trim()}
              className="mt-3 w-full rounded-xl bg-[var(--brand)] px-4 py-3 font-medium text-[var(--brand-on)] disabled:opacity-40"
            >
              Aggiungi al carrello
            </button>
            <p className="mt-2 text-center text-xs text-neutral-500">
              Se serve qualcosa di diverso dal solito, il barman può
              correggere il prezzo: te lo vedi aggiornato qui.
            </p>
          </div>
        </div>
      )}

      {askingParty && (
        <div
          className="fixed inset-0 z-40 flex items-end"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onClick={() => setAskingParty(null)}
        >
          <div
            className="mx-auto w-full max-w-md rounded-t-3xl bg-white p-4 pb-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-200" />
            <div className="text-lg font-semibold">In quanti siete al tavolo?</div>
            <p className="mt-1 text-sm text-neutral-500">
              Serve per dividere le consumazioni condivise. Puoi cambiarlo
              chiedendo al personale.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {[2, 3, 4, 5, 6, 7, 8, 10].map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    setPartySize(n);
                    const richiesta = askingParty;
                    setAskingParty(null);
                    // Il prodotto che ha fatto scattare la domanda entra ora.
                    if (richiesta) add(richiesta.p, richiesta.v, true);
                  }}
                  className="flex h-14 w-14 items-center justify-center rounded-2xl border bd text-lg font-semibold"
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {variantFor && (
        <div
          className="fixed inset-0 z-40 flex items-end"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onClick={() => setVariantFor(null)}
        >
          <div
            className="mx-auto w-full max-w-md rounded-t-3xl bg-white p-4 pb-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-200" />
            <div className="text-lg font-semibold">{variantFor.name}</div>
            <p className="mt-0.5 text-sm text-neutral-500">Scegli il formato</p>
            <div className="mt-3 space-y-2">
              {variantFor.variants
                .filter((v) => v.available)
                .map((v) => (
                  <button
                    key={v.id}
                    onClick={() => add(variantFor, v)}
                    className="flex min-h-14 w-full items-center justify-between rounded-xl border bd px-4 py-3 text-left"
                  >
                    <span className="font-medium">{v.name}</span>
                    <span className="font-semibold">{fmt(v.priceCents)}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {count > 0 && !cartOpen && (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md p-3">
          <button
            onClick={() => setCartOpen(true)}
            className="flex w-full items-center justify-between rounded-2xl bg-[var(--brand)] px-5 py-3.5 text-[var(--brand-on)] shadow-lg"
          >
            <span className="flex items-center gap-2 text-sm">
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white/20 px-1.5 text-xs font-semibold">
                {count}
              </span>
              Vedi carrello
            </span>
            <span className="font-semibold">{fmt(total)}</span>
          </button>
        </div>
      )}

      {cartOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setCartOpen(false)}
        >
          <div
            className="mx-auto max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-200" />
            <div className="mb-2 text-lg font-semibold">Il tuo ordine</div>
            {splitBill && (
              <p className="mb-3 text-sm text-neutral-500">
                Ognuno paga la sua parte. Sposta una voce col menu a tendina.
              </p>
            )}
            <ul className="space-y-2">
              {righeCarrello.map(({ intestazione, c, idx }) => (
                <li
                  key={idx}
                  className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-sm"
                >
                  {intestazione && (
                    <div
                      className={
                        "flex w-full items-baseline justify-between " +
                        (intestazione.primo
                          ? ""
                          : "mt-2 border-t border-neutral-100 pt-2.5")
                      }
                    >
                      <span className="font-semibold">{intestazione.alias}</span>
                      <span className="tabular-nums font-medium">
                        {fmt(intestazione.subtotale)}
                      </span>
                    </div>
                  )}
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <div className="flex shrink-0 items-center rounded-lg border border-neutral-200">
                      <button
                        onClick={() => setQty(idx, -1)}
                        aria-label={"Togli " + c.name}
                        className="flex h-11 w-11 items-center justify-center text-lg"
                      >
                        −
                      </button>
                      <span className="w-6 text-center tabular-nums">{c.qty}</span>
                      <button
                        onClick={() => setQty(idx, 1)}
                        aria-label={"Aggiungi " + c.name}
                        className="flex h-11 w-11 items-center justify-center text-lg"
                      >
                        +
                      </button>
                    </div>
                    <span className="min-w-0 flex-1">{c.name}</span>
                  </div>
                  <div className="ml-auto flex shrink-0 items-center gap-2">
                    {splitBill && (
                      <Select
                        size="sm"
                        className="w-24"
                        value={c.alias}
                        onChange={(v) => reassign(idx, v)}
                        options={people.map((p) => ({ value: p, label: p }))}
                      />
                    )}
                    <span className="w-[4.5rem] whitespace-nowrap text-right font-medium tabular-nums">
                      {fmt(c.priceCents * c.qty)}
                    </span>
                  </div>

                  {/* La richiesta va per intero su una riga sua: stretta nella
                      colonna del nome diventava una colonna di parole. */}
                  {c.note && (
                    <div className="w-full pl-2 text-xs italic text-neutral-500">
                      «{c.note}»
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3">
              <span className="text-sm text-neutral-500">Totale tavolo</span>
              <span className="text-lg font-semibold">{fmt(total)}</span>
            </div>
            <button
              onClick={send}
              disabled={sending}
              className="mt-3 w-full rounded-xl bg-[var(--brand)] px-4 py-3 font-medium text-[var(--brand-on)] disabled:opacity-50"
            >
              {sending ? "Invio..." : "Invia ordine"}
            </button>
          </div>
        </div>
      )}
    </>
  );
  }

  return (
    <div className={Skin.rootClassName}>
      {Skin.css && <style dangerouslySetInnerHTML={{ __html: Skin.css }} />}
      {content}
    </div>
  );
}
