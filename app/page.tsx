import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { slugFromHost } from "@/lib/tenant-host";
import { getTenant } from "@/lib/tenants";
import { MODULES, getModule, getTenantModules } from "@/lib/modules";
import { PACCHETTI } from "@/lib/billing/listino";
import { getImpostazioni } from "@/lib/billing/impostazioni";
import { contestoOrdineWeb } from "@/lib/ordini-web";
import { CHANNELS } from "@/lib/channels";
import { STILE_LANDING } from "@/components/landing/stile";
import Scena from "@/components/landing/Scena";
import Rivela from "@/components/landing/Rivela";
import ModuloContatto from "@/components/landing/ModuloContatto";
import Firma from "@/components/Firma";
import { configSmtp, indirizzoContatto } from "@/lib/mail";
import {
  MiniQr,
  MiniStampa,
  PannelloConto,
  PannelloCoda,
  PannelloOrdineWeb,
  PannelloPrenotazione,
  PannelloRecensione,
  PannelloRubrica,
  PannelloStatoOrdine,
  SchermoCliente,
} from "@/components/landing/Mockup";

function Titolo({
  occhiello,
  children,
  sotto,
}: {
  occhiello: string;
  children: React.ReactNode;
  sotto?: string;
}) {
  return (
    <div className="max-w-2xl">
      <div className="lp-occhiello">{occhiello}</div>
      <h2 className="lp-display mt-3 text-3xl sm:text-4xl">{children}</h2>
      {sotto && (
        <p className="mt-3 text-base" style={{ color: "var(--muted)" }}>
          {sotto}
        </p>
      )}
    </div>
  );
}

export default async function Home() {
  const host = (await headers()).get("host") ?? "";
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "";
  const slug = slugFromHost(host, rootDomain);
  const tenant = await getTenant(slug);

  // Sottodominio di un locale -> home del locale.
  if (tenant) {
    if (tenant.suspended || tenant.serviceBlocked) {
      return (
        <main className="mx-auto max-w-md px-6 py-20 text-center">
          <h1 className="text-xl font-medium">{tenant.name}</h1>
          <p className="mt-2" style={{ color: "var(--muted)" }}>
            Temporaneamente non disponibile.
          </p>
        </main>
      );
    }
    // Cosa puo' fare chi arriva sul sito del locale dipende dai moduli accesi:
    // dove si prenota, la prenotazione e' la ragione per cui uno e' finito qui.
    const moduli = await getTenantModules(tenant.id);
    // E dove si ordina, il tasto per ordinare: il contesto torna null da solo
    // quando il locale dal sito non vende, e allora il tasto non esiste.
    const ordini = await contestoOrdineWeb();

    return (
      <main className="mx-auto max-w-md px-6 py-20 text-center">
        {tenant.logoUrl ? (
          <div className="mx-auto flex w-fit items-center justify-center rounded-2xl bg-black px-6 py-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={tenant.logoUrl} alt={tenant.name} className="h-14 w-auto" />
          </div>
        ) : (
          <h1 className="text-3xl font-semibold">{tenant.name}</h1>
        )}

        {moduli.reservations && (
          <div className="mt-10">
            <a href="/prenota" className="btn btn-primary w-full">
              Prenota un tavolo
            </a>
            <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
              Scegli quante persone siete, il giorno e l&apos;ora. Vedi solo gli
              orari con un tavolo davvero libero.
            </p>
          </div>
        )}

        {ordini && (
          <div className="mt-6">
            <a
              href="/ordina"
              className={
                moduli.reservations ? "btn w-full" : "btn btn-primary w-full"
              }
            >
              {ordini.canali.includes("domicilio")
                ? ordini.canali.includes("asporto")
                  ? "Ordina: ritiro o consegna"
                  : "Ordina a domicilio"
                : "Ordina e passa a ritirare"}
            </a>
            <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
              {ordini.sospesoFino
                ? "Stasera non prendiamo altri ordini dal sito: riaprono domani."
                : "Scegli dal menu e l'ora. Gli orari che vedi sono quelli in cui la cucina ce la fa davvero."}
            </p>
          </div>
        )}

        {moduli.qr_ordering && (
          <>
            <p className="mt-8 text-lg">Inquadra il QR sul tuo tavolo</p>
            <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
              Ti apre il menu e ti permette di ordinare dal telefono. Il codice
              si trova sul tavolo: senza scansionarlo non è possibile ordinare.
            </p>
          </>
        )}

        <p className="mt-8 text-sm" style={{ color: "var(--muted)" }}>
          Sei dello staff?{" "}
          <a href="/login" className="underline">
            Accedi alla gestione
          </a>
        </p>
      </main>
    );
  }

  // Nessun locale corrisponde. La vetrina esce solo sul dominio radice e su
  // comanda.<dominio> (e su localhost in sviluppo): ogni altro sottodominio
  // inventato riceve un 404 pulito ("Locale non trovato") invece della vetrina.
  const rootBare = (rootDomain || "localhost:3000").split(":")[0];
  const isVetrina =
    slug === "comanda" || slug === rootBare || slug === "localhost";
  if (!isVetrina) notFound();

  // Dominio radice -> landing pubblica. I moduli, i pacchetti e i canali si
  // leggono dal catalogo e dal listino: la vetrina non puo' promettere
  // qualcosa che il prodotto non ha, ne' un pacchetto che non si vende.
  const inArrivo = MODULES.filter((m) => m.comingSoon);

  // Quello che un pacchetto accende, letto come differenza da quello prima:
  // chi guarda sta scegliendo fra tre cose, e quello che gli serve sapere e'
  // cosa cambia salendo. I pacchetti sono uno dentro l'altro, ma se un giorno
  // smettessero di esserlo si torna da soli all'elenco intero.
  const pacchetti = PACCHETTI.map((p, i) => {
    const prima = i > 0 ? PACCHETTI[i - 1] : null;
    const dentro = prima ? prima.moduli.every((k) => p.moduli.includes(k)) : false;
    const moduli = dentro
      ? p.moduli.filter((k) => !prima!.moduli.includes(k))
      : p.moduli;
    return {
      key: p.key,
      label: p.label,
      sopra: dentro ? prima!.label : null,
      voci: moduli.map((k) => getModule(k).label),
    };
  });
  const canali = CHANNELS;

  // I giorni di prova sono quelli veri: la vetrina promette il numero che il
  // locale nuovo si trova davvero addosso, non uno scritto a mano qui che
  // resterebbe indietro il giorno che lo cambio.
  const { trialDays: giorniProva } = await getImpostazioni();

  // L'indirizzo di esempio esce dal dominio vero, cosi' dice quello che il
  // locale si trovera' davvero. In sviluppo non c'e' niente da far vedere, e
  // la frase si accorcia invece di promettere «iltuolocale.localhost».
  const esempioIndirizzo = rootBare.includes("localhost")
    ? null
    : `iltuolocale.${rootBare}`;

  // Il modulo compare solo se la casella e' collegata davvero: se manca,
  // meglio l'indirizzo da copiare che un modulo che scrive nel vuoto.
  const moduloAttivo = configSmtp() !== null;
  const emailContatto = indirizzoContatto();

  return (
    <main className="lp">
      <style dangerouslySetInnerHTML={{ __html: STILE_LANDING }} />

      {/* ---------- Apertura ---------- */}
      <section className="lp-sezione relative pb-24 pt-20 sm:pt-28">
        <div className="lp-alone" />
        <div className="lp-contenuto relative grid items-center gap-16 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <Rivela>
              <div className="lp-occhiello">Comanda</div>
              <h1 className="lp-display mt-4 text-[2.6rem] sm:text-6xl">
                I tuoi clienti ordinano dal tavolo.
                <br />
                <span style={{ color: "var(--lp-accent)" }}>
                  Il tuo staff smette di rincorrere.
                </span>
              </h1>
            </Rivela>

            <Rivela ritardo={120}>
              <p
                className="mt-6 max-w-xl text-lg"
                style={{ color: "var(--muted)" }}
              >
                Il tavolo si prenota dal sito, il menu sta sul telefono del
                cliente, le comande partono da sole verso cucina e bar, e il
                conto è già diviso per persona. Chi a tavola non ci viene ordina
                lo stesso — ritiro o consegna, dal sito e senza telefonare.
                Senza scaricare nessuna app e senza toccare la cassa che avete
                già. Si comincia con {giorniProva} giorni di prova, sul locale
                vero.
              </p>
            </Rivela>

            <Rivela ritardo={220}>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href={moduloAttivo ? "#contatti" : `mailto:${emailContatto}`}
                  className="btn btn-primary"
                >
                  Provalo gratis per {giorniProva} giorni
                </a>
                <a href="#come-funziona" className="btn">
                  Vedi come funziona
                </a>
              </div>
              <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span
                  className="lp-pill"
                  style={{
                    background: "var(--lp-accent-soft)",
                    color: "var(--lp-accent)",
                  }}
                >
                  {giorniProva} giorni gratis
                </span>
                <span style={{ color: "var(--muted)" }}>
                  Nel vostro locale, coi vostri clienti. Senza carta.
                </span>
              </p>
              <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                Nessuna installazione. Il locale resta con il suo registratore
                telematico.
              </p>
            </Rivela>
          </div>

          <Rivela ritardo={160}>
            <Scena>
              <SchermoCliente />
              <PannelloCoda className="lp-pannello-coda" />
              <PannelloConto className="lp-pannello-conto" />
            </Scena>
          </Rivela>
        </div>
      </section>

      {/* ---------- Il problema ---------- */}
      <section className="lp-sezione lp-bordo-sopra">
        <div className="lp-contenuto">
          <Rivela>
            <Titolo occhiello="Il problema">
              Nel pienone si perde tempo
              <br />
              nei due momenti che contano
            </Titolo>
          </Rivela>

          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {[
              {
                n: "01",
                t: "Si aspetta per ordinare",
                p: "Un cameriere non basta quando il locale è pieno. Il cliente alza la mano, aspetta, si innervosisce — ed è spesso la prima cosa che finisce nella recensione.",
              },
              {
                n: "02",
                t: "Il conto è una trattativa",
                p: "«Chi ha preso cosa?» prima al tavolo e poi di nuovo alla cassa. Dividere in parti uguali scontenta qualcuno, dividere per davvero fa perdere dieci minuti a tavolo.",
              },
            ].map((c, i) => (
              <Rivela key={c.n} ritardo={i * 110}>
                <div className="lp-vetro lp-vetro-attiva h-full p-6">
                  <div className="lp-numero">{c.n}</div>
                  <h3 className="mt-3 text-lg font-semibold">{c.t}</h3>
                  <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
                    {c.p}
                  </p>
                </div>
              </Rivela>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Come funziona ---------- */}
      <section
        id="come-funziona"
        className="lp-sezione lp-bordo-sopra scroll-mt-4"
        style={{ background: "var(--surface-2)" }}
      >
        <div className="lp-contenuto">
          <Rivela>
            <Titolo
              occhiello="Come funziona"
              sotto="Quattro passaggi, nessuno dei quali chiede al locale di cambiare come lavora."
            >
              Dal tavolo alla cucina,
              <br />
              senza passare da nessuno
            </Titolo>
          </Rivela>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                t: "Inquadra",
                p: "Il cliente scansiona il QR del tavolo. Si apre il menu con foto, ingredienti e allergeni. Il codice vale per qualche ora: poi si riscansiona.",
                v: <MiniQr />,
              },
              {
                t: "Ordina",
                p: "Aggiunge al carrello e sceglie chi paga cosa: sé stesso, un amico, o il tavolo. Su ogni voce può scrivere «senza ghiaccio».",
                v: (
                  <div className="space-y-1.5">
                    <div className="lp-riga" style={{ width: "70%" }} />
                    <div
                      className="lp-riga"
                      style={{ width: "45%", background: "var(--lp-accent)", opacity: 0.5 }}
                    />
                    <div className="lp-riga" style={{ width: "60%" }} />
                  </div>
                ),
              },
              {
                t: "Prepara",
                p: "La comanda si smista da sola: le pizze in pizzeria, i cocktail al bar. Chi non ha un tablet la riceve stampata sulla stampante del reparto.",
                v: <MiniStampa />,
              },
              {
                t: "Incassa",
                p: "A fine serata il conto è già diviso per persona, con la quota del condiviso e il coperto calcolati. Si incassa uno alla volta.",
                v: (
                  <div className="space-y-1.5">
                    {["Anna", "Marco"].map((n, i) => (
                      <div
                        key={n}
                        className="flex items-center justify-between rounded-md px-2 py-1.5"
                        style={{
                          background: i === 0 ? "var(--ok-bg)" : "var(--surface)",
                          fontSize: 11,
                          border: "1px solid var(--border)",
                        }}
                      >
                        <span>{n}</span>
                        <span style={{ fontWeight: 600 }}>
                          {i === 0 ? "Pagato" : "€14,00"}
                        </span>
                      </div>
                    ))}
                  </div>
                ),
              },
            ].map((s, i) => (
              <Rivela key={s.t} ritardo={i * 90}>
                <div className="lp-vetro lp-vetro-attiva flex h-full flex-col p-5">
                  <div className="flex items-center gap-3">
                    <span className="lp-passo-indice">{i + 1}</span>
                    <h3 className="font-semibold">{s.t}</h3>
                  </div>
                  <p
                    className="mt-3 flex-1 text-sm"
                    style={{ color: "var(--muted)" }}
                  >
                    {s.p}
                  </p>
                  <div className="mt-4">{s.v}</div>
                </div>
              </Rivela>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- I canali ---------- */}
      <section className="lp-sezione lp-bordo-sopra">
        <div className="lp-contenuto">
          <Rivela>
            <Titolo
              occhiello="Non solo la sala"
              sotto="Ogni canale ha il suo conto, le sue attese e i suoi dati. Si accendono quelli che servono al locale, uno per uno."
            >
              Sala, banco, asporto e domicilio
            </Titolo>
          </Rivela>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {canali.map((c, i) => (
              <Rivela key={c.key} ritardo={i * 80}>
                <div className="lp-vetro lp-vetro-attiva h-full p-5">
                  <div className="flex items-baseline justify-between">
                    <h3 className="font-semibold">{c.label}</h3>
                    <span
                      className="lp-pill"
                      style={{
                        background: "var(--lp-accent-soft)",
                        color: "var(--lp-accent)",
                      }}
                    >
                      {c.seduti ? "coperto" : "senza coperto"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
                    {c.key === "tavolo" &&
                      "Il conto è del tavolo e raccoglie tutti gli ordini, anche di telefoni diversi."}
                    {c.key === "banco" &&
                      "Cassa a tocco singolo da PC o tablet, con i più richiesti fra i preferiti. Si incassa subito."}
                    {c.key === "asporto" &&
                      "Ogni ordine è un conto a sé, col nome di chi ritira e l'ora concordata: al telefono, oppure dal sito."}
                    {c.key === "domicilio" &&
                      "Indirizzo con i suggerimenti mentre si scrive, telefono, e il costo di consegna che esce dalla distanza."}
                  </p>
                  <div
                    className="mt-3 text-xs"
                    style={{ color: "var(--muted)" }}
                  >
                    Attesa anomala oltre {c.attesaDanger} min
                  </div>
                </div>
              </Rivela>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Ordini dal sito ---------- */}
      <section className="lp-sezione lp-bordo-sopra">
        <div className="lp-contenuto grid items-center gap-14 lg:grid-cols-[0.9fr_1fr]">
          <Rivela>
            <div className="mx-auto grid max-w-sm gap-4">
              <PannelloOrdineWeb />
              <PannelloStatoOrdine />
            </div>
          </Rivela>

          <Rivela ritardo={120}>
            <Titolo
              occhiello="Asporto e domicilio"
              sotto="Il telefono che squilla durante il servizio è un cameriere in meno in sala. Chi ordina dal sito non ve lo fa squillare, e scrive lui il proprio indirizzo."
            >
              Si ordina dal sito,
              <br />
              senza telefonare
            </Titolo>

            <ul className="mt-8 space-y-5">
              {[
                [
                  "Gli orari che si vedono sono quelli veri",
                  "La capienza si conta in pezzi, non in ordini: un carrello da trenta pizze vede meno orari di uno da due, perché sono le stesse trenta pizze che qualcuno deve infornare. Il tetto è uno solo per ritiro e consegna — il forno è quello — e lo occupano anche gli ordini battuti in cassa.",
                ],
                [
                  "Nessun ordine entra in cucina da solo",
                  "Arriva in cima alla coda, sotto «Da accettare»: prima di dire di sì si cambia l'ora concordata, si corregge il costo di consegna e anche il prezzo di una riga. La comanda parte quando accettate, non prima. Chi lo preferisce accende l'accettazione automatica, e la tiene a mano per le consegne.",
                ],
                [
                  "«Senza cipolla» ha un posto dove si scrive",
                  "Ogni riga del carrello ha la sua nota, su qualunque prodotto: è la cosa che al telefono si dice sempre, e senza un posto dove scriverla il cliente o telefona lo stesso o rinuncia. In cucina la stessa pizza con due note diverse resta due righe, perché sono due cose diverse.",
                ],
                [
                  "Il costo di consegna esce dalla distanza",
                  "Le zone si scrivono come righe «fino a X km → costo e minimo d'ordine»: una riga sola vuol dire costo fisso per tutti, e l'ultima è il confine oltre il quale non si consegna — a chi resta fuori si propone il ritiro. Prezzi, distanza e costo li calcola sempre il server: dal telefono del cliente non arriva nessun importo.",
                ],
                [
                  "Quando la cucina è al completo si chiude il rubinetto",
                  "«Sospendi per stasera» lascia la pagina in piedi e dice ai clienti di chiamare. Si riapre da sola a mezzanotte, perché l'interruttore che resta giù è quello che tiene un locale chiuso al web per una settimana senza che nessuno se ne accorga.",
                ],
              ].map(([t, p]) => (
                <li key={t} className="flex gap-4">
                  <span
                    className="mt-1.5 h-2 w-2 flex-none rounded-full"
                    style={{ background: "var(--lp-accent)" }}
                    aria-hidden="true"
                  />
                  <div>
                    <div className="font-semibold">{t}</div>
                    <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                      {p}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="lp-vetro mt-8 p-5" style={{ borderStyle: "dashed" }}>
              <div className="font-semibold">La telefonata del «è pronto?»</div>
              <p className="mt-1.5 text-sm" style={{ color: "var(--muted)" }}>
                Il link che il cliente ha già è anche il posto dove guarda il suo
                ordine avanzare: ricevuto, confermato, in preparazione, pronto,
                in consegna, ritirato. La pagina si aggiorna da sola mentre
                l&apos;ordine è in ballo, e si rilegge quando lui riprende il
                telefono in mano. Se spostate l&apos;ora, quella riga cambia
                davanti ai suoi occhi con un avviso: è l&apos;ora a cui esce di
                casa.
              </p>
            </div>

            <p className="mt-6 text-sm" style={{ color: "var(--muted)" }}>
              Si paga al ritiro o alla consegna: dal sito non si incassa niente.
              Le mail partono dalla casella del locale e sono tre, da accendere
              una per una e per canale — la conferma e gli aggiornamenti al
              cliente, l&apos;avviso a chi lavora. Chi tiene la coda a schermo
              tutta la sera l&apos;avviso se lo toglie.
            </p>
          </Rivela>
        </div>
      </section>

      {/* ---------- Rubrica ---------- */}
      <section className="lp-sezione lp-bordo-sopra">
        <div className="lp-contenuto grid items-center gap-14 lg:grid-cols-[1fr_0.9fr]">
          <Rivela>
            <Titolo occhiello="Chi ordina da casa">
              Scrivi tre lettere del nome,
              <br />
              l&apos;indirizzo lo sa già
            </Titolo>

            <ul className="mt-8 space-y-5">
              {[
                [
                  "Un cliente, una scheda",
                  "Nome, telefono, via, civico, CAP e la nota di consegna — «citofono rotto, secondo piano» — si compilano tutti insieme scegliendo dall'elenco. Chi ordina ogni giovedì non ridetta niente, e il civico non si sbaglia perché nessuno lo sta ribattendo.",
                ],
                [
                  "Riconosce il numero, non come è scritto",
                  "«+39 333 1234567» e «3331234567» sono la stessa persona: la scheda si aggiorna invece di diventare la terza uguale alle altre due. Al telefono si cerca dal nome o dal numero, quello che arriva prima.",
                ],
                [
                  "Si riempie lavorando",
                  "A ogni ordine la spunta «salva in rubrica» è già accesa: la rubrica si costruisce da sola battendo le comande. Si spegne per il cliente di passaggio o per chi non vuole lasciare i propri dati, e torna accesa all'ordine dopo.",
                ],
                [
                  "Quella che avete già si importa",
                  "Il foglio Excel, l'export del gestionale vecchio, la lista incollata: virgole o punti e virgola, intestazioni scritte come vi pare. Chi c'è già viene aggiornato e non duplicato — reimportare lo stesso file non fa danni.",
                ],
              ].map(([t, p]) => (
                <li key={t} className="flex gap-4">
                  <span
                    className="mt-1.5 h-2 w-2 flex-none rounded-full"
                    style={{ background: "var(--lp-accent)" }}
                    aria-hidden="true"
                  />
                  <div>
                    <div className="font-semibold">{t}</div>
                    <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                      {p}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <p className="mt-8 text-sm" style={{ color: "var(--muted)" }}>
              Serve soprattutto a chi consegna, ma vale anche all&apos;asporto:
              chi passa a ritirare tutte le settimane si riconosce dal nome. Come
              tutto il resto si accende quando serve — un locale di sola sala non
              se la porta dietro.
            </p>
          </Rivela>

          <Rivela ritardo={120}>
            <div className="flex justify-center lg:justify-end">
              <PannelloRubrica />
            </div>
          </Rivela>
        </div>
      </section>

      {/* ---------- Prenotazione ---------- */}
      <section className="lp-sezione lp-bordo-sopra">
        <div className="lp-contenuto grid items-center gap-14 lg:grid-cols-[0.9fr_1fr]">
          <Rivela>
            <div className="flex justify-center lg:justify-start">
              <PannelloPrenotazione />
            </div>
          </Rivela>

          <Rivela ritardo={120}>
            <Titolo occhiello="Prima ancora di entrare">
              Il tavolo si prenota dal sito,
              <br />
              non al telefono durante il servizio
            </Titolo>

            <ul className="mt-8 space-y-5">
              {[
                [
                  "Propone solo quello che c'è davvero",
                  "Le fasce nascono dai vostri orari e dai vostri tavoli, con i posti che avete dichiarato. Se alle 20:30 non c'è niente per sei persone, quell'orario non compare: nessuna richiesta da rifiutare il giorno dopo.",
                ],
                [
                  "La sala si muove, e il conto dei posti pure",
                  "Cinque tavoli da due, accostati, diventano un tavolo da dieci; un tavolo da due regge il terzo commensale con una sedia in più. Quanti tavoli si possono unire e quante sedie si aggiungono lo decide il locale — chi non li sposta mette uno e zero.",
                ],
                [
                  "Il tavolo se lo assegna da solo",
                  "Fra tutte le combinazioni che tengono il gruppo sceglie quella che spreca meno posti, così il tavolo grande non se lo prendono in due. A parità di posti sprecati, sposta meno tavoli.",
                ],
                [
                  "Confermi, sposti o rifiuti — e la mail parte",
                  "Dalla casella del locale, con il link alla prenotazione dentro. Se sposti l'orario, il cliente deve accettarlo dalla mail: un tavolo cambiato in silenzio è un tavolo vuoto.",
                ],
                [
                  "La sera si spunta e basta",
                  "Arrivati, non presentati, chi ha telefonato. Chi buca la prenotazione resta scritto, che è l'unico modo per accorgersene la terza volta.",
                ],
              ].map(([t, p]) => (
                <li key={t} className="flex gap-4">
                  <span
                    className="mt-1.5 h-2 w-2 flex-none rounded-full"
                    style={{ background: "var(--lp-accent)" }}
                    aria-hidden="true"
                  />
                  <div>
                    <div className="font-semibold">{t}</div>
                    <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                      {p}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <p className="mt-8 text-sm" style={{ color: "var(--muted)" }}>
              È un indirizzo pubblico del locale — da mettere su Google, nella
              bio e sul menu — e si accende come tutto il resto: se non vi
              serve, non esiste.
            </p>

            <div className="lp-vetro mt-8 p-5" style={{ borderStyle: "dashed" }}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">E chi telefona lo stesso?</span>
                <span className="badge badge-muted">in arrivo</span>
              </div>
              <p className="mt-1.5 text-sm" style={{ color: "var(--muted)" }}>
                Un agent AI risponderà al posto vostro mentre siete in sala:
                chiede per quando e in quanti, guarda gli stessi posti che vede
                il sito e scrive la prenotazione in agenda. Chi al telefono ci
                tiene continua a chiamare, e il telefono smette di suonare nel
                mezzo del servizio.
              </p>
            </div>
          </Rivela>
        </div>
      </section>

      {/* ---------- Due schermi ---------- */}
      <section
        className="lp-sezione lp-bordo-sopra"
        style={{ background: "var(--surface-2)" }}
      >
        <div className="lp-contenuto grid items-center gap-14 lg:grid-cols-2">
          <Rivela>
            <Titolo occhiello="Lato staff">
              Chi prepara vede solo
              <br />
              quello che deve preparare
            </Titolo>
            <ul className="mt-8 space-y-5">
              {[
                [
                  "Le comande si smistano da sole",
                  "Ogni categoria del menu va a un reparto. Il pizzaiolo riceve le pizze, il barman i cocktail, e nessuno dei due legge la lista dell'altro.",
                ],
                [
                  "Il colore dice chi aspetta troppo",
                  "Le soglie cambiano per canale: venti minuti su un domicilio sono normali, su un tavolo sono un disastro.",
                ],
                [
                  "Se un prodotto finisce, si annulla",
                  "La voce esce dal conto ma resta barrata, e sul telefono del cliente compare cosa gli è stato tolto.",
                ],
                [
                  "«Mi aggiungete due birre?»",
                  "Si aggiungono al conto anche a comanda già partita: al tavolo nasce un ordine nuovo, fuori dalla sala le righe si attaccano a quello che c'è già. In cucina va una comanda con le sole righe nuove — ristampare tutto vorrebbe dire far rifare da capo quello che stavano preparando.",
                ],
                [
                  "Chi incassa gli asporti non scorre i tavoli",
                  "Le stesse pillole filtrano per provenienza la coda e i conti aperti: sala, banco, asporto, domicilio. E quello che è già incassato non si tocca più, né nel prezzo né nella nota.",
                ],
              ].map(([t, p], i) => (
                <li key={t} className="flex gap-4">
                  <span
                    className="mt-1.5 h-2 w-2 flex-none rounded-full"
                    style={{ background: "var(--lp-accent)" }}
                    aria-hidden="true"
                  />
                  <div>
                    <div className="font-semibold">{t}</div>
                    <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                      {p}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Rivela>

          <Rivela ritardo={140}>
            <div className="mx-auto grid max-w-sm gap-4">
              <PannelloCoda />
              <PannelloConto />
            </div>
          </Rivela>
        </div>
      </section>

      {/* ---------- La sala ---------- */}
      <section className="lp-sezione lp-bordo-sopra">
        <div className="lp-contenuto">
          <Rivela>
            <Titolo
              occhiello="In sala"
              sotto="Le due domande che durante il servizio si gridano da una parte all'altra della sala, e a cui nessuna pagina sapeva rispondere."
            >
              «Il sei è libero?»
              <br />
              «Quelli da quanto sono lì?»
            </Titolo>
          </Rivela>

          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {[
              [
                "La sala si guarda dall'alto",
                "La pianta dei tavoli con quello che di ognuno si sa adesso: da quanto sono seduti, in quanti, quanto hanno consumato, se aspettano dalla cucina e se hanno chiamato. Dopo due ore il pallino diventa giallo.",
              ],
              [
                "Arrivano in sei e si tira di fianco il tavolo libero",
                "I due tavoli si uniscono dalla sala: da quel momento risultano occupati tutti e due, il conto è uno solo e quello che si ordina dal QR del tavolo accostato ci finisce sopra da sé. Sul conto e sulla comanda si legge «Tavoli 4+5».",
              ],
              [
                "L'ordine battuto sul 5 invece che sul 6",
                "Il conto si sposta su un altro tavolo e si porta dietro tutto: consumazioni, incassi già presi, chiamate in attesa. Prima l'unica uscita era annullare le righe, che sul conto restano barrate per sempre.",
              ],
              [
                "Chi è al tavolo si tocca, non si riscrive",
                "Quando è il cameriere a battere l'ordine, «a nome di chi?» è l'elenco di chi a quel tavolo ha già ordinato: un tocco ed è dentro al menu con la persona giusta già scelta.",
              ],
            ].map(([t, p], i) => (
              <Rivela key={t} ritardo={(i % 2) * 110}>
                <div className="lp-vetro lp-vetro-attiva h-full p-6">
                  <h3 className="font-semibold">{t}</h3>
                  <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
                    {p}
                  </p>
                </div>
              </Rivela>
            ))}
          </div>

          <Rivela ritardo={140}>
            <p className="mt-8 max-w-2xl text-sm" style={{ color: "var(--muted)" }}>
              E si fa tutto dal telefono: da uno schermo stretto la barra
              laterale esce di scena e torna col bottone, perché in sala nessuno
              gira col portatile in mano.
            </p>
          </Rivela>
        </div>
      </section>

      {/* ---------- Com'e' andata ---------- */}
      <section className="lp-sezione lp-bordo-sopra">
        <div className="lp-contenuto grid items-center gap-14 lg:grid-cols-[0.9fr_1fr]">
          <Rivela>
            <div className="flex justify-center lg:justify-start">
              <PannelloRecensione />
            </div>
          </Rivela>

          <Rivela ritardo={120}>
            <Titolo
              occhiello="A cose fatte"
              sotto="La domanda arriva quando l'ordine è chiuso, e al tavolo subito dopo l'invio: lì è una riga sola, che si apre solo se qualcuno la tocca. Chi sta mangiando non deve trovarsi addosso un questionario."
            >
              La recensione la leggi tu,
              <br />
              prima che finisca su Google
            </Titolo>

            <ul className="mt-8 space-y-5">
              {[
                [
                  "Una per ordine, e dietro c'è qualcuno che ha consumato davvero",
                  "È quello che la rende verificata, ed è anche il motivo per cui non c'è niente da chiedere su chi sei: la risposta è legata all'ordine, e un secondo invio non ne scrive una seconda né riscrive la prima.",
                ],
                [
                  "Serve per intervenire, non per farsi belli",
                  "Le risposte restano nella dashboard del locale: non le pubblica nessuno. Accorgersi che la carbonara di venerdì non andava prima che quella frase finisca su Google vale una telefonata; dopo, vale solo una risposta pubblica.",
                ],
                [
                  "Il link al profilo pubblico lo vede chiunque abbia risposto",
                  "Con qualunque voto, anche chi ne ha dati due. Mandarci solo i contenti e tenersi le lamentele in casa si chiama review gating ed è vietato dalle regole di Google e di Trustpilot: per questo non c'è nessuna soglia da configurare, e non è una dimenticanza.",
                ],
                [
                  "Una recensione non si scrive mai al posto del cliente",
                  "Su Google non esiste nemmeno il modo — l'API della scheda le fa leggere e rispondere, non scrivere — e comunque sarebbe una recensione falsa: pratica commerciale scorretta, non una scorciatoia. L'unica strada è il link, che il cliente apre col suo account.",
                ],
              ].map(([t, p]) => (
                <li key={t} className="flex gap-4">
                  <span
                    className="mt-1.5 h-2 w-2 flex-none rounded-full"
                    style={{ background: "var(--lp-accent)" }}
                    aria-hidden="true"
                  />
                  <div>
                    <div className="font-semibold">{t}</div>
                    <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                      {p}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <p className="mt-8 text-sm" style={{ color: "var(--muted)" }}>
              Nasce spenta, come tutto il resto: è una domanda che il locale fa
              ai suoi clienti, e se la vuole fare la decide lui.
            </p>
          </Rivela>
        </div>
      </section>

      {/* ---------- Pacchetti ---------- */}
      <section className="lp-sezione lp-bordo-sopra">
        <div className="lp-contenuto">
          <Rivela>
            <Titolo
              occhiello="Pacchetti"
              sotto={`I moduli non si spuntano uno per uno: li porta il pacchetto, e salendo si paga la differenza. Un locale di sola sala non si porta dietro la consegna — e quale sia il vostro lo si sa dopo i ${giorniProva} giorni di prova, non prima.`}
            >
              Si sceglie un pacchetto,
              <br />
              non una lista di caselle
            </Titolo>
          </Rivela>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {pacchetti.map((p, i) => (
              <Rivela key={p.key} ritardo={i * 90}>
                <div className="lp-vetro lp-vetro-attiva flex h-full flex-col p-6">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="lp-display text-2xl">{p.label}</h3>
                    {p.sopra && (
                      <span
                        className="lp-pill"
                        style={{
                          background: "var(--lp-accent-soft)",
                          color: "var(--lp-accent)",
                        }}
                      >
                        tutto {p.sopra}
                      </span>
                    )}
                  </div>
                  <div
                    className="mt-3 text-xs"
                    style={{ color: "var(--muted)" }}
                  >
                    {p.sopra ? "In più" : "Accende"}
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {p.voci.map((v) => (
                      <li key={v} className="flex gap-2 text-sm">
                        <span
                          className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full"
                          style={{ background: "var(--lp-accent)" }}
                          aria-hidden="true"
                        />
                        <span>{v}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Rivela>
            ))}
          </div>

          <Rivela ritardo={120}>
            <div className="lp-vetro mt-5 p-6" style={{ borderStyle: "dashed" }}>
              <div className="font-semibold">
                E se la combinazione che serve non c&apos;è?
              </div>
              <p className="mt-1.5 text-sm" style={{ color: "var(--muted)" }}>
                Si compone su misura, col suo prezzo: un locale che consegna ma
                al tavolo non ci fa sedere nessuno non deve comprare la sala per
                avere la consegna. Il prezzo sta nel pacchetto — uno solo, non
                una somma di voci in fondo alla fattura.
              </p>
            </div>
          </Rivela>

          <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {inArrivo.map((m, i) => (
              <Rivela key={m.key} ritardo={(i % 3) * 80}>
                <li
                  className="lp-vetro h-full list-none p-5"
                  style={{ borderStyle: "dashed" }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold" style={{ color: "var(--muted)" }}>
                      {m.label}
                    </span>
                    <span className="badge badge-muted">in arrivo</span>
                  </div>
                  <div className="mt-1.5 text-sm" style={{ color: "var(--muted)" }}>
                    {m.description}
                  </div>
                </li>
              </Rivela>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------- La prova ---------- */}
      <section id="prova" className="lp-sezione lp-bordo-sopra scroll-mt-4">
        <div className="lp-contenuto">
          <Rivela>
            <div className="lp-vetro relative overflow-hidden p-8 sm:p-12">
              <div className="lp-alone" />
              <div className="relative grid gap-10 lg:grid-cols-[0.8fr_1fr]">
                <div>
                  <div className="lp-occhiello">Prima di scegliere</div>
                  <div
                    className="lp-display mt-3 leading-none"
                    style={{ fontSize: "clamp(3.5rem, 9vw, 5.5rem)" }}
                  >
                    {giorniProva}
                  </div>
                  <div className="lp-display text-3xl sm:text-4xl">
                    giorni di prova
                  </div>
                  <p className="mt-4" style={{ color: "var(--muted)" }}>
                    Non una demo con un menu finto: il vostro locale, acceso per
                    davvero, col vostro menu e i vostri clienti che ordinano.
                    Alla fine dei {giorniProva} giorni si sceglie il pacchetto —
                    o non se ne fa niente.
                  </p>
                  <a
                    href={
                      moduloAttivo ? "#contatti" : `mailto:${emailContatto}`
                    }
                    className="btn btn-primary mt-6"
                  >
                    Comincia la prova
                  </a>
                </div>

                <ul className="space-y-5">
                  {[
                    [
                      "Non si lascia una carta",
                      `Si comincia con una mail e si finisce con una decisione: per ${giorniProva} giorni non c'è niente da pagare e non parte nessun addebito, perché non ci avete lasciato niente da addebitare.`,
                    ],
                    [
                      "È in produzione, non in prova",
                      esempioIndirizzo
                        ? `Il locale sta al suo indirizzo — ${esempioIndirizzo} — coi vostri colori e il vostro logo. I QR sui tavoli sono quelli veri: quello che i clienti ordinano in quei giorni è lavoro fatto, non una simulazione da rifare.`
                        : "Il locale sta al suo indirizzo, coi vostri colori e il vostro logo. I QR sui tavoli sono quelli veri: quello che i clienti ordinano in quei giorni è lavoro fatto, non una simulazione da rifare.",
                    ],
                    [
                      "Il pacchetto lo dicono i vostri numeri",
                      "Alla fine la dashboard non consiglia: conta. Quante prenotazioni avete preso, quanti ordini avete battuto, da quali canali — e qual è il pacchetto più piccolo che copre quello che avete usato davvero. «Hai preso 34 prenotazioni, quindi ti serve Pro» è un argomento; «ti consigliamo Pro» è una vendita.",
                    ],
                    [
                      "Se non se ne fa niente non si disfa niente",
                      "Il servizio si ferma, i vostri dati restano dove sono e il titolare continua a entrare per rileggerli. La cassa non l'avete mai toccata, quindi non c'è nessuna migrazione da annullare: la sera dopo si lavora come la sera prima.",
                    ],
                  ].map(([t, p]) => (
                    <li key={t} className="flex gap-4">
                      <span
                        className="mt-1.5 h-2 w-2 flex-none rounded-full"
                        style={{ background: "var(--lp-accent)" }}
                        aria-hidden="true"
                      />
                      <div>
                        <div className="font-semibold">{t}</div>
                        <p
                          className="mt-1 text-sm"
                          style={{ color: "var(--muted)" }}
                        >
                          {p}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Rivela>
        </div>
      </section>

      {/* ---------- La promessa onesta ---------- */}
      <section className="lp-sezione lp-bordo-sopra">
        <div className="lp-contenuto">
          <Rivela>
            <div className="lp-vetro relative overflow-hidden p-8 sm:p-12">
              <div className="lp-alone" />
              <div className="relative max-w-2xl">
                <div className="lp-occhiello">Quello che non facciamo</div>
                <h2 className="lp-display mt-3 text-3xl sm:text-4xl">
                  Non sostituisce la tua cassa
                </h2>
                <p className="mt-4" style={{ color: "var(--muted)" }}>
                  Comanda sta <em>sopra</em> quello che avete già: non incassa
                  denaro e non emette documenti fiscali. Lo scontrino continua a
                  uscire dal vostro registratore telematico, esattamente come
                  oggi. Niente migrazione, niente riconfigurazioni, niente
                  formazione da capo — e il giorno che smettete, la cassa
                  continua a funzionare come prima.
                </p>
              </div>
            </div>
          </Rivela>
        </div>
      </section>

      {/* ---------- Chiusura ---------- */}
      <section id="contatti" className="lp-sezione scroll-mt-4 pb-28">
        <div className="lp-contenuto">
          <Rivela>
            <div
              className="relative overflow-hidden rounded-3xl px-6 py-12 sm:px-12 sm:py-14"
              style={{
                background:
                  "linear-gradient(140deg, var(--hero-from), var(--hero-to))",
                color: "#ffffff",
              }}
            >
              <div className="lp-alone" />
              <div
                className={
                  moduloAttivo
                    ? "relative grid items-center gap-10 lg:grid-cols-[1fr_1.05fr]"
                    : "relative text-center"
                }
              >
                <div className={moduloAttivo ? "text-center lg:text-left" : ""}>
                  <h2 className="lp-display text-3xl sm:text-4xl">
                    {giorniProva} giorni, sul tuo menu
                  </h2>
                  <p
                    className={`mt-4 max-w-lg text-white/75 ${
                      moduloAttivo ? "mx-auto lg:mx-0" : "mx-auto"
                    }`}
                  >
                    Scriveteci che locale avete: apriamo il vostro con il vostro
                    menu, il vostro logo e i vostri colori, e lo tenete acceso
                    per {giorniProva} giorni con i clienti veri. Poi si decide —
                    o non si decide niente, e non è successo niente.
                  </p>

                  {moduloAttivo ? (
                    <p className="mt-6 text-sm text-white/60">
                      Preferisci la posta?{" "}
                      <a
                        href={`mailto:${emailContatto}`}
                        className="underline"
                        style={{ color: "inherit" }}
                      >
                        {emailContatto}
                      </a>
                    </p>
                  ) : (
                    <a
                      href={`mailto:${emailContatto}`}
                      className="btn mt-8"
                      style={{
                        background: "#ffffff",
                        borderColor: "#ffffff",
                        color: "#111111",
                      }}
                    >
                      Scrivici
                    </a>
                  )}
                </div>

                {moduloAttivo && <ModuloContatto indirizzo={emailContatto} />}
              </div>
            </div>
          </Rivela>

          <p
            className="mt-10 text-center text-sm"
            style={{ color: "var(--muted)" }}
          >
            Sei dello staff di un locale?{" "}
            <a href="/login" className="underline">
              Accedi alla gestione
            </a>
          </p>
        </div>
      </section>

      {/* ---------- Firma ---------- */}
      <footer
        className="lp-sezione lp-bordo-sopra"
        style={{ paddingTop: "40px", paddingBottom: "40px" }}
      >
        <div className="lp-contenuto flex flex-col items-center gap-1.5 text-center">
          <Firma />
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Comanda · {new Date().getFullYear()}
          </p>
        </div>
      </footer>
    </main>
  );
}
