import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { slugFromHost } from "@/lib/tenant-host";
import { getTenant } from "@/lib/tenants";
import { MODULES, getTenantModules } from "@/lib/modules";
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
  PannelloPrenotazione,
  PannelloRubrica,
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

  // Dominio radice -> landing pubblica. I moduli e i canali si leggono dal
  // catalogo: la vetrina non puo' promettere qualcosa che il prodotto non ha.
  const attivabili = MODULES.filter((m) => !m.comingSoon);
  const inArrivo = MODULES.filter((m) => m.comingSoon);
  const canali = CHANNELS;

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
                conto è già diviso per persona. Senza scaricare nessuna app e
                senza toccare la cassa che avete già.
              </p>
            </Rivela>

            <Rivela ritardo={220}>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href={moduloAttivo ? "#contatti" : `mailto:${emailContatto}`}
                  className="btn btn-primary"
                >
                  Chiedi una demo col tuo menu
                </a>
                <a href="#come-funziona" className="btn">
                  Vedi come funziona
                </a>
              </div>
              <p className="mt-4 text-xs" style={{ color: "var(--muted)" }}>
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
                      "Ogni ordine è un conto a sé, col nome di chi ritira e l'ora concordata al telefono."}
                    {c.key === "domicilio" &&
                      "Indirizzo con i suggerimenti mentre si scrive, telefono e costo di consegna nel totale."}
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

      {/* ---------- Moduli ---------- */}
      <section className="lp-sezione lp-bordo-sopra">
        <div className="lp-contenuto">
          <Rivela>
            <Titolo
              occhiello="Moduli"
              sotto="Si accendono uno alla volta, quando servono. Un locale che vuole solo il menu digitale non si porta dietro il resto."
            >
              Paghi quello che accendi
            </Titolo>
          </Rivela>

          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {attivabili.map((m, i) => (
              <Rivela key={m.key} ritardo={(i % 3) * 80}>
                <li className="lp-vetro lp-vetro-attiva h-full list-none p-5">
                  <div className="font-semibold">{m.label}</div>
                  <div className="mt-1.5 text-sm" style={{ color: "var(--muted)" }}>
                    {m.description}
                  </div>
                </li>
              </Rivela>
            ))}
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
                    Vuoi vederlo sul tuo menu?
                  </h2>
                  <p
                    className={`mt-4 max-w-lg text-white/75 ${
                      moduloAttivo ? "mx-auto lg:mx-0" : "mx-auto"
                    }`}
                  >
                    Prepariamo una demo con il vostro menu, il vostro logo e i
                    vostri colori, così vedete come apparirebbe davvero ai
                    vostri clienti — prima di decidere qualsiasi cosa.
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
