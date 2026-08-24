"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  cercaFasce,
  inviaOrdine,
  stimaConsegna,
  type EsitoStima,
} from "@/app/ordina/actions";
import { formatKm, formatPrice, type GiornoScelta } from "@/lib/format";
import type { MenuCategory, MenuProduct } from "@/lib/menu";
import type { Channel } from "@/lib/channels";
import type { ImpostazioniCanale, MotivoVuoto } from "@/lib/ordini-web";
import IndirizzoAuto from "@/components/IndirizzoAuto";

// Il modulo d'ordine, in passi che si aprono uno dopo l'altro come nella
// prenotazione. L'ordine dei passi non e' un vezzo: prima si sceglie cosa si
// vuole — che e' il motivo per cui uno e' su questa pagina — e solo dopo aver
// visto un orario possibile si chiedono nome, telefono e indirizzo.
//
// L'unica differenza vera con la prenotazione e' che qui la disponibilita'
// dipende dal carrello: gli orari liberi per due pizze non sono quelli liberi
// per trenta, e vanno richiesti al server ogni volta che il carrello cambia.

type Riga = {
  // Identifica la riga nel carrello: due volte lo stesso prodotto con note
  // diverse sono due righe, perche' in cucina sono due cose diverse.
  chiave: string;
  productId: string;
  variantId: string | null;
  nome: string;
  prezzoCents: number;
  quantita: number;
  note: string;
};

function Passo({
  indice,
  titolo,
  fatto,
  children,
}: {
  indice: number;
  titolo: string;
  fatto: boolean;
  children: React.ReactNode;
}) {
  const id = `or-passo-${indice}`;
  return (
    <section className="pr-passo" role="group" aria-labelledby={id}>
      <h2 id={id} className="pr-titolo-passo">
        <span className="pr-indice" data-fatto={fatto ? "si" : "no"}>
          {fatto ? "✓" : indice}
        </span>
        {titolo}
      </h2>
      {children}
    </section>
  );
}

function chiaveDi(productId: string, variantId: string | null, note: string) {
  return `${productId}:${variantId ?? ""}:${note}`;
}

const VUOTO: Record<MotivoVuoto, string> = {
  oltre: "Per quel giorno è ancora presto: prova con uno più vicino.",
  chiuso: "Quel giorno il locale è chiuso.",
  pieno: "Quel giorno è tutto pieno. Prova con un altro.",
  "troppo-grande":
    "Il carrello è più grande di quanto la cucina prepara in una volta: per un ordine così chiama il locale.",
};

export default function ModuloOrdine({
  canali,
  menu,
  giorni,
  regole,
  telefono,
  raggioKm,
  gratisSopraCents,
  emailObbligatoria,
}: {
  canali: Channel[];
  menu: MenuCategory[];
  giorni: Record<Channel, GiornoScelta[]>;
  // Le regole del locale, canale per canale: nota, minimo d'ordine, giorni in
  // avanti, accettazione automatica. Cambiando canale cambiano le parole della
  // pagina, non solo il menu.
  regole: Record<Channel, ImpostazioniCanale>;
  telefono: string | null;
  raggioKm: number;
  gratisSopraCents: number;
  // Il locale ha la posta configurata: allora l'email si chiede sul serio, ed
  // è lì che arriva la conferma quando l'ordine viene accettato.
  emailObbligatoria: boolean;
}) {
  const router = useRouter();

  const [canale, setCanale] = useState<Channel>(canali[0]);
  // Le regole del canale scelto adesso.
  const regola = regole[canale];
  const [carrello, setCarrello] = useState<Riga[]>([]);
  const [categoria, setCategoria] = useState(menu[0]?.id ?? "");
  const [cerca, setCerca] = useState("");

  // L'indirizzo composto da <IndirizzoAuto>: via, civico e comune in una riga
  // sola, come lo scriverebbe una persona. Scala e interno stanno a parte:
  // servono a chi suona, non a chi cerca la strada.
  const [via, setVia] = useState("");
  const [dettagli, setDettagli] = useState("");
  const [stima, setStima] = useState<EsitoStima | null>(null);
  const [stimando, setStimando] = useState(false);

  const [giorno, setGiorno] = useState("");
  const [ora, setOra] = useState("");
  const [fasce, setFasce] = useState<string[]>([]);
  const [motivo, setMotivo] = useState<MotivoVuoto | null>(null);
  const [caricando, setCaricando] = useState(false);

  const [nome, setNome] = useState("");
  const [tel, setTel] = useState("");
  const [email, setEmail] = useState("");
  const [sito, setSito] = useState("");
  const [inviando, setInviando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  // --- Menu del canale scelto ---
  //
  // Il filtro sta qui e non sul server: le due spunte viaggiano gia' con ogni
  // prodotto, e passare da "ritiro" a "consegna" deve essere immediato, non un
  // altro viaggio e un'altra attesa.
  const menuCanale = useMemo(
    () =>
      menu
        .map((c) => ({
          ...c,
          products: c.products.filter((p) =>
            canale === "asporto" ? p.takeawayAvailable : p.deliveryAvailable
          ),
        }))
        .filter((c) => c.products.length > 0),
    [menu, canale]
  );

  // La categoria aperta puo' sparire cambiando canale: si ricade sulla prima.
  useEffect(() => {
    if (!menuCanale.some((c) => c.id === categoria)) {
      setCategoria(menuCanale[0]?.id ?? "");
    }
  }, [menuCanale, categoria]);

  // La ricerca guarda tutto il menu del canale, non la sola sezione aperta:
  // chi cerca "margherita" non sa in quale sezione l'avete messa. E guarda
  // anche ingredienti e formati, perche' "senza glutine" e "media" sono due
  // modi legittimi di cercare una cosa che a nome non si chiama cosi'.
  const q = cerca.trim().toLowerCase();
  const trovati = useMemo(() => {
    if (!q) {
      const aperta = menuCanale.find((c) => c.id === categoria) ?? menuCanale[0];
      return aperta ? [aperta] : [];
    }
    return menuCanale
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
      .filter((c) => c.products.length > 0);
  }, [menuCanale, categoria, q]);

  const imponibile = carrello.reduce(
    (s, r) => s + r.prezzoCents * r.quantita,
    0
  );
  const pezzi = carrello.reduce((s, r) => s + r.quantita, 0);
  const consegna = stima?.ok ? stima.costoCents : 0;
  const indirizzo = [via.trim(), dettagli.trim()].filter(Boolean).join(", ");
  // Un indirizzo scelto dall'elenco arriva con il comune attaccato; uno
  // battuto a mano no, e va bene lo stesso — la ricerca parte comunque intorno
  // al locale. Sotto le otto lettere pero' non c'e' ancora niente da cercare.
  const indirizzoPronto = via.trim().length >= 8;

  // --- Il costo della consegna ---
  //
  // Si richiede al server: la distanza la misura lui, e il minimo d'ordine si
  // misura sul carrello di adesso — aggiungere una pizza puo' far scattare la
  // consegna offerta, toglierla puo' farla ricadere sotto il minimo.
  useEffect(() => {
    if (canale !== "domicilio" || !indirizzoPronto || !imponibile) {
      setStima(null);
      return;
    }
    let vivo = true;
    setStimando(true);
    const t = setTimeout(async () => {
      const esito = await stimaConsegna(indirizzo, imponibile);
      if (!vivo) return;
      setStima(esito);
      setStimando(false);
    }, 700);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [canale, indirizzo, indirizzoPronto, imponibile]);

  // --- Gli orari liberi ---
  const giorniDelCanale = giorni[canale] ?? [];

  useEffect(() => {
    if (!giorno || !pezzi) {
      setFasce([]);
      setMotivo(null);
      return;
    }
    let vivo = true;
    setCaricando(true);
    const t = setTimeout(async () => {
      const esito = await cercaFasce(canale, giorno, pezzi);
      if (!vivo) return;
      if (esito.ok) {
        setFasce(esito.fasce);
        setMotivo(esito.motivo ?? null);
        // L'ora scelta prima puo' non esserci piu': meglio perderla che
        // mandare un ordine per un orario che intanto si e' riempito.
        setOra((precedente) =>
          esito.fasce.includes(precedente) ? precedente : ""
        );
      } else {
        setFasce([]);
        setMotivo(null);
        setErrore(esito.errore);
      }
      setCaricando(false);
    }, 350);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [canale, giorno, pezzi]);

  // Cambiando canale cambiano i giorni proponibili: quello scelto per il
  // ritiro puo' non essere piu' buono per la consegna, che parte piu' tardi.
  useEffect(() => {
    if (giorno && !giorniDelCanale.some((g) => g.iso === giorno)) {
      setGiorno("");
      setOra("");
    }
  }, [giorno, giorniDelCanale]);

  // --- Carrello ---
  function aggiungi(p: MenuProduct, variantId: string | null, note = "") {
    const variante = p.variants.find((v) => v.id === variantId) ?? null;
    const chiave = chiaveDi(p.id, variantId, note);
    setErrore(null);
    setCarrello((prev) => {
      const gia = prev.find((r) => r.chiave === chiave);
      if (gia) {
        return prev.map((r) =>
          r.chiave === chiave
            ? { ...r, quantita: Math.min(r.quantita + 1, 99) }
            : r
        );
      }
      return [
        ...prev,
        {
          chiave,
          productId: p.id,
          variantId,
          nome: variante ? `${p.name} — ${variante.name}` : p.name,
          prezzoCents: variante ? variante.priceCents : p.priceCents,
          quantita: 1,
          note,
        },
      ];
    });
  }

  function togli(chiave: string) {
    setCarrello((prev) =>
      prev
        .map((r) => (r.chiave === chiave ? { ...r, quantita: r.quantita - 1 } : r))
        .filter((r) => r.quantita > 0)
    );
  }

  const quantitaDi = (productId: string, variantId: string | null) =>
    carrello
      .filter((r) => r.productId === productId && r.variantId === variantId)
      .reduce((s, r) => s + r.quantita, 0);

  // --- Invio ---
  const consegnaBloccata = canale === "domicilio" && (!stima || !stima.ok);
  const puoInviare =
    !!pezzi &&
    !!giorno &&
    !!ora &&
    nome.trim().length >= 2 &&
    tel.trim().length >= 6 &&
    (!emailObbligatoria || email.includes("@")) &&
    (canale !== "domicilio" || (indirizzoPronto && !consegnaBloccata)) &&
    !inviando;

  async function invia() {
    setInviando(true);
    setErrore(null);
    const esito = await inviaOrdine({
      canale,
      righe: carrello.map((r) => ({
        productId: r.productId,
        variantId: r.variantId,
        quantity: r.quantita,
        note: r.note,
      })),
      giorno,
      ora,
      nome,
      telefono: tel,
      email,
      indirizzo: canale === "domicilio" ? indirizzo : "",
      sito,
    });

    if (esito.ok) {
      // Al token vuoto si arriva solo dall'esca: al robot si risponde di si' e
      // non lo si manda da nessuna parte.
      if (esito.token) router.push(`/ordina/${esito.token}`);
      else setInviando(false);
      return;
    }
    setErrore(esito.errore);
    setInviando(false);
  }

  const primoRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ora) primoRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [ora]);

  let passo = 1;

  return (
    <div className="mt-8">
      {canali.length > 1 && (
        <Passo indice={passo++} titolo="Ritiro o consegna" fatto>
          <div className="pr-scelte">
            {canali.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={canale === c}
                onClick={() => setCanale(c)}
                className="pr-chip"
              >
                {c === "asporto" ? "Passo a ritirare" : "Portatemela a casa"}
              </button>
            ))}
          </div>
        </Passo>
      )}

      <Passo indice={passo++} titolo="Cosa ordini" fatto={pezzi > 0}>
        {menuCanale.length === 0 ? (
          <p className="pr-avviso mt-3">
            {canale === "asporto"
              ? "Non c'è ancora niente da portare via."
              : "Non c'è ancora niente da consegnare."}
          </p>
        ) : (
          <>
            {/* Su un menu da centocinquanta voci la ricerca non e' un lusso: chi
                cerca "margherita" non sa in quale sezione l'avete messa, ed e'
                il motivo per cui sta cercando. */}
            <div className="or-cerca">
              <input
                value={cerca}
                onChange={(e) => setCerca(e.target.value)}
                placeholder="Cerca piatto o ingrediente…"
                aria-label="Cerca nel menu"
                className="input"
              />
              {cerca && (
                <button
                  type="button"
                  onClick={() => setCerca("")}
                  aria-label="Pulisci la ricerca"
                  className="or-pulisci"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Sotto ricerca le pillole non servono: si guarda tutto il menu. */}
            {!q && menuCanale.length > 1 && (
              <div className="pr-scelte pr-fila">
                {menuCanale.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={categoria === c.id}
                    onClick={() => setCategoria(c.id)}
                    className="pr-chip"
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}

            {q && trovati.length === 0 ? (
              <p className="pr-avviso mt-3">
                Nessun risultato per «{cerca}».
              </p>
            ) : (
              <div className="mt-3">
                {trovati.map((c) => (
                  <div key={c.id}>
                    {/* Il nome della sezione compare solo fra i risultati: li'
                        le righe arrivano da sezioni diverse, e senza non si sa
                        da quale. */}
                    {q && (
                      <div
                        className="mt-3 text-xs font-semibold uppercase tracking-wider"
                        style={{ color: "var(--muted)" }}
                      >
                        {c.name}
                      </div>
                    )}
                    {c.products.map((p) => (
                      <ProdottoRiga
                        key={p.id}
                        p={p}
                        quantita={quantitaDi(p.id, null)}
                        quantitaVariante={(v) => quantitaDi(p.id, v)}
                        aggiungi={aggiungi}
                        togli={(v, note) => togli(chiaveDi(p.id, v, note))}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {carrello.length > 0 && (
          <div className="or-carrello mt-4">
            {carrello.map((r) => (
              <div key={r.chiave} className="or-voce">
                <span className="flex-1">
                  <span className="font-medium">{r.nome}</span>
                  {r.note && (
                    <span className="block text-xs" style={{ color: "var(--muted)" }}>
                      {r.note}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => togli(r.chiave)}
                  aria-label={`Togli uno ${r.nome}`}
                  className="or-passo"
                >
                  −
                </button>
                <span className="or-quantita">{r.quantita}</span>
                <span className="tnum w-16 text-right">
                  {formatPrice(r.prezzoCents * r.quantita)}
                </span>
              </div>
            ))}

            {canale === "domicilio" && (
              <div className="or-conto mt-3">
                <span>Consegna</span>
                <span>
                  {stimando
                    ? "…"
                    : stima?.ok
                      ? stima.costoCents === 0
                        ? "offerta"
                        : formatPrice(stima.costoCents)
                      : "da calcolare"}
                </span>
              </div>
            )}

            <div className="or-totale">
              <span>Totale</span>
              <span>{formatPrice(imponibile + consegna)}</span>
            </div>

            {/* Il minimo del canale si dice subito, nel carrello: scoprirlo
                alla fine, dopo aver scritto nome, telefono e indirizzo, è il
                modo migliore per far chiudere la pagina. */}
            {regola.minimoCents > 0 && imponibile < regola.minimoCents && (
              <p className="mt-2 text-xs" style={{ color: "var(--warn-text)" }}>
                {canale === "domicilio"
                  ? "Per la consegna serve un ordine da "
                  : "Per il ritiro serve un ordine da "}
                {formatPrice(regola.minimoCents)}: ti mancano{" "}
                {formatPrice(regola.minimoCents - imponibile)}.
              </p>
            )}

            {gratisSopraCents > 0 &&
              canale === "domicilio" &&
              imponibile < gratisSopraCents && (
                <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                  Sopra {formatPrice(gratisSopraCents)} la consegna è offerta:
                  ti mancano {formatPrice(gratisSopraCents - imponibile)}.
                </p>
              )}
          </div>
        )}
      </Passo>

      {canale === "domicilio" && (
        <Passo
          indice={passo++}
          titolo="Dove te la portiamo"
          fatto={!!stima?.ok}
        >
          <div className="mt-3 grid gap-3">
            {/* Lo stesso campo della cassa: la via si sceglie da un elenco, il
                civico sta in un campo suo — è quello che si perde, ed è quello
                senza cui il fattorino gira a vuoto. Se il servizio non risponde
                o la via non è in elenco si scrive a mano e l'ordine parte lo
                stesso. */}
            <IndirizzoAuto value={via} onChange={setVia} />
            <label className="pr-campo">
              <span className="pr-etichetta">
                Scala, interno, citofono{" "}
                <span className="opacity-70">(se serve)</span>
              </span>
              <input
                value={dettagli}
                onChange={(e) => setDettagli(e.target.value)}
                placeholder="Scala B, interno 3"
                maxLength={80}
                className="input"
              />
            </label>
          </div>

          {stimando && (
            <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
              Calcolo la consegna…
            </p>
          )}
          {!stimando && stima && (
            <p
              className={stima.ok ? "pr-riepilogo mt-3" : "pr-avviso mt-3"}
              style={stima.ok ? undefined : { color: "var(--danger)" }}
              role="status"
            >
              {stima.messaggio}
            </p>
          )}
          {!stima && !stimando && raggioKm > 0 && (
            <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
              Si consegna fino a {formatKm(raggioKm)} dal locale.
            </p>
          )}
        </Passo>
      )}

      <Passo indice={passo++} titolo="Quando" fatto={!!ora}>
        {!pezzi ? (
          <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
            Scegli prima cosa ordinare: gli orari dipendono da quanto c&apos;è
            da preparare.
          </p>
        ) : (
          <>
            <div className="pr-scelte pr-fila">
              {giorniDelCanale.map((g) => (
                <button
                  key={g.iso}
                  type="button"
                  aria-pressed={giorno === g.iso}
                  onClick={() => {
                    setGiorno(g.iso);
                    setOra("");
                  }}
                  className="pr-chip pr-chip-giorno"
                >
                  <span>{g.numero}</span>
                  <small>
                    {g.nome} {g.mese}
                  </small>
                </button>
              ))}
            </div>

            {giorno && (
              <>
                {caricando ? (
                  <div className="pr-ore">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className="pr-scheletro"
                        style={{ background: "var(--surface-2)" }}
                      />
                    ))}
                  </div>
                ) : fasce.length ? (
                  <div className="pr-ore">
                    {fasce.map((f) => (
                      <button
                        key={f}
                        type="button"
                        aria-pressed={ora === f}
                        onClick={() => setOra(f)}
                        className="pr-chip"
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="pr-avviso mt-3">
                    {motivo ? VUOTO[motivo] : "Nessun orario disponibile."}
                    {telefono && (
                      <>
                        {" "}
                        Per un orario diverso chiama il{" "}
                        <a href={`tel:${telefono}`} className="underline">
                          {telefono}
                        </a>
                        .
                      </>
                    )}
                  </p>
                )}
              </>
            )}

            {giorniDelCanale.length > 0 && regola.giorniAvanti > 7 && (
              <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
                Si ordina fino a {regola.giorniAvanti} giorni in anticipo.
              </p>
            )}
          </>
        )}
      </Passo>

      {!!ora && (
        <div className="pr-appare" ref={primoRef}>
          <Passo
            indice={passo++}
            titolo="Chi sei"
            fatto={nome.trim().length >= 2 && tel.trim().length >= 6}
          >
            <div className="mt-3 grid gap-3">
              <label className="pr-campo">
                <span className="pr-etichetta">
                  {canale === "asporto" ? "Nome di chi ritira" : "Nome"}
                </span>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  maxLength={80}
                  autoComplete="name"
                  className="input"
                />
              </label>
              <label className="pr-campo">
                <span className="pr-etichetta">Telefono</span>
                <input
                  value={tel}
                  onChange={(e) => setTel(e.target.value)}
                  inputMode="tel"
                  maxLength={32}
                  autoComplete="tel"
                  className="input"
                />
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  Serve al locale per avvisarti se qualcosa non torna.
                </span>
              </label>

              {/* L'email si chiede solo dove il locale la usa davvero: dove la
                  posta non è configurata non partirebbe niente, e chiederla
                  sarebbe prometterla. */}
              {emailObbligatoria && (
                <label className="pr-campo">
                  <span className="pr-etichetta">Email</span>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    inputMode="email"
                    maxLength={160}
                    autoComplete="email"
                    className="input"
                  />
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    Ci arriva la conferma con il link per rivedere l&apos;ordine.
                  </span>
                </label>
              )}

              {/* Esca per i robot: sta fuori schermo e nessuno la vede. */}
              <input
                value={sito}
                onChange={(e) => setSito(e.target.value)}
                className="pr-esca"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
              />
            </div>

            {/* La riga della casa cambia con il canale: «il ritiro si tiene 15
                minuti» non c'entra niente con una consegna. */}
            {regola.nota && <p className="pr-avviso mt-4">{regola.nota}</p>}

            <p className="mt-4 text-sm" style={{ color: "var(--muted)" }}>
              {regola.accettazioneAutomatica
                ? ""
                : "L'ordine arriva al locale, che lo conferma. "}
              {canale === "domicilio"
                ? "Si paga alla consegna, a chi te lo porta."
                : "Si paga al ritiro, in cassa."}
            </p>
          </Passo>

          <div className="or-barra">
            {errore && (
              <p
                role="status"
                className="mb-2 text-sm"
                style={{ color: "var(--danger)" }}
              >
                {errore}
              </p>
            )}
            <button
              type="button"
              onClick={invia}
              disabled={!puoInviare}
              className="btn btn-primary w-full"
              style={{ minHeight: 48 }}
            >
              {inviando
                ? "Invio…"
                : `Invia l'ordine · ${formatPrice(imponibile + consegna)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Una riga del menu. I prodotti con piu' formati mostrano un bottone per
// formato: sceglierne uno **e** la quantita' vorrebbe dire due tocchi per
// niente, e su un telefono in piedi il secondo tocco non lo fa nessuno.
function ProdottoRiga({
  p,
  quantita,
  quantitaVariante,
  aggiungi,
  togli,
}: {
  p: MenuProduct;
  quantita: number;
  quantitaVariante: (variantId: string) => number;
  aggiungi: (p: MenuProduct, variantId: string | null, note?: string) => void;
  togli: (variantId: string | null, note: string) => void;
}) {
  const [richiesta, setRichiesta] = useState("");

  return (
    <div className="or-riga">
      {p.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.imageUrl} alt="" className="or-foto" />
      )}

      <div className="min-w-0 flex-1">
        <div className="or-nome">{p.name}</div>
        {p.description && <div className="or-desc">{p.description}</div>}
        {!p.variants.length && (
          <div className="or-prezzo mt-1">{formatPrice(p.priceCents)}</div>
        )}

        {p.variants.length > 0 && (
          <div className="pr-scelte" style={{ marginTop: 8 }}>
            {p.variants
              .filter((v) => v.available)
              .map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => aggiungi(p, v.id)}
                  className="pr-chip"
                >
                  {v.name} · {formatPrice(v.priceCents)}
                  {quantitaVariante(v.id) > 0 && ` (${quantitaVariante(v.id)})`}
                </button>
              ))}
          </div>
        )}

        {p.acceptsNote && (
          <div className="mt-2 flex items-end gap-2">
            <label className="pr-campo flex-1">
              <span className="pr-etichetta">Cosa desideri</span>
              <input
                value={richiesta}
                onChange={(e) => setRichiesta(e.target.value)}
                maxLength={200}
                placeholder="Scrivi qui"
                className="input"
              />
            </label>
            <button
              type="button"
              disabled={!richiesta.trim()}
              onClick={() => {
                aggiungi(p, null, richiesta.trim());
                setRichiesta("");
              }}
              className="btn btn-sm"
            >
              Aggiungi
            </button>
          </div>
        )}
      </div>

      {!p.variants.length && !p.acceptsNote && (
        <div className="flex items-center gap-2">
          {quantita > 0 && (
            <>
              <button
                type="button"
                onClick={() => togli(null, "")}
                aria-label={`Togli uno ${p.name}`}
                className="or-passo"
              >
                −
              </button>
              <span className="or-quantita">{quantita}</span>
            </>
          )}
          <button
            type="button"
            onClick={() => aggiungi(p, null)}
            aria-label={`Aggiungi ${p.name}`}
            className="or-passo"
            data-forte="si"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}
