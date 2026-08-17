import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { slugFromHost } from "@/lib/tenant-host";
import { getTenant } from "@/lib/tenants";
import { MODULES } from "@/lib/modules";
import { CHANNELS } from "@/lib/channels";
import { STILE_LANDING } from "@/components/landing/stile";
import Scena from "@/components/landing/Scena";
import Rivela from "@/components/landing/Rivela";
import {
  MiniQr,
  MiniStampa,
  PannelloConto,
  PannelloCoda,
  SchermoCliente,
} from "@/components/landing/Mockup";

// Indirizzo a cui arrivano le richieste dalla landing.
const EMAIL_CONTATTO = "samu.viola8@gmail.com";

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
    if (tenant.suspended) {
      return (
        <main className="mx-auto max-w-md px-6 py-20 text-center">
          <h1 className="text-xl font-medium">{tenant.name}</h1>
          <p className="mt-2" style={{ color: "var(--muted)" }}>
            Temporaneamente non disponibile.
          </p>
        </main>
      );
    }
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

        <p className="mt-8 text-lg">Inquadra il QR sul tuo tavolo</p>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          Ti apre il menu e ti permette di ordinare dal telefono. Il codice si
          trova sul tavolo: senza scansionarlo non è possibile ordinare.
        </p>

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
                Un QR sul tavolo, il menu sul telefono del cliente, le comande
                che partono da sole verso cucina e bar, e il conto già diviso
                per persona. Senza scaricare nessuna app e senza toccare la
                cassa che avete già.
              </p>
            </Rivela>

            <Rivela ritardo={220}>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href={`mailto:${EMAIL_CONTATTO}`} className="btn btn-primary">
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
      <section className="lp-sezione pb-28">
        <div className="lp-contenuto">
          <Rivela>
            <div
              className="relative overflow-hidden rounded-3xl px-8 py-14 text-center sm:px-12"
              style={{
                background:
                  "linear-gradient(140deg, var(--hero-from), var(--hero-to))",
                color: "#ffffff",
              }}
            >
              <div className="lp-alone" />
              <div className="relative">
                <h2 className="lp-display text-3xl sm:text-4xl">
                  Vuoi vederlo sul tuo menu?
                </h2>
                <p className="mx-auto mt-4 max-w-lg text-white/75">
                  Prepariamo una demo con il vostro menu, il vostro logo e i
                  vostri colori, così vedete come apparirebbe davvero ai vostri
                  clienti — prima di decidere qualsiasi cosa.
                </p>
                <a
                  href={`mailto:${EMAIL_CONTATTO}`}
                  className="btn mt-8"
                  style={{
                    background: "#ffffff",
                    borderColor: "#ffffff",
                    color: "#111111",
                  }}
                >
                  Scrivici
                </a>
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
    </main>
  );
}
