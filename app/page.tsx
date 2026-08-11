import { getTenantFromHost } from "@/lib/tenant-host";
import { MODULES } from "@/lib/modules";

// Indirizzo a cui arrivano le richieste dalla landing.
const EMAIL_CONTATTO = "samu.viola8@gmail.com";

function Passo({
  numero,
  titolo,
  testo,
}: {
  numero: string;
  titolo: string;
  testo: string;
}) {
  return (
    <div className="card p-5">
      <div
        className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold"
        style={{ background: "var(--brand)", color: "var(--brand-on)" }}
      >
        {numero}
      </div>
      <h3 className="mt-3 font-semibold">{titolo}</h3>
      <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
        {testo}
      </p>
    </div>
  );
}

export default async function Home() {
  const tenant = await getTenantFromHost();

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
          Sei dello staff? <a href="/login" className="underline">Accedi alla gestione</a>
        </p>
      </main>
    );
  }

  // Dominio radice -> landing pubblica.
  const attivabili = MODULES.filter((m) => !m.comingSoon);
  const inArrivo = MODULES.filter((m) => m.comingSoon);

  return (
    <main>
      <section className="mx-auto max-w-3xl px-6 pb-16 pt-24">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          I tuoi clienti ordinano dal tavolo.
          <br />
          Il tuo staff smette di rincorrere.
        </h1>

        <p className="mt-5 text-lg" style={{ color: "var(--muted)" }}>
          Un QR sul tavolo, il menu sul telefono del cliente, gli ordini in coda
          allo staff e il conto già diviso per persona. Senza scaricare
          nessuna app.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <a href={`mailto:${EMAIL_CONTATTO}`} className="btn btn-primary">
            Chiedi una demo
          </a>
          <a href="#come-funziona" className="btn">
            Come funziona
          </a>
        </div>
      </section>

      <section
        className="border-y px-6 py-16"
        style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
      >
        <div className="mx-auto max-w-3xl">
          <h2 className="text-sm font-medium uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            Il problema
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="font-semibold">Si aspetta per ordinare</h3>
              <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                Nei momenti di pienone un cameriere non basta. Il cliente alza la
                mano, aspetta, si innervosisce — e spesso è la prima cosa
                che scrive nella recensione.
              </p>
            </div>
            <div>
              <h3 className="font-semibold">Il conto è una trattativa</h3>
              <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                &laquo;Chi ha preso cosa?&raquo; al tavolo, poi di nuovo alla
                cassa. Dividere in parti uguali scontenta qualcuno, dividere per
                davvero fa perdere dieci minuti.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="come-funziona" className="mx-auto max-w-3xl scroll-mt-8 px-6 py-16">
        <h2 className="text-sm font-medium uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          Come funziona
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Passo
            numero="1"
            titolo="Inquadra"
            testo="Il cliente scansiona il QR del tavolo e apre il menu, con foto, ingredienti e allergeni."
          />
          <Passo
            numero="2"
            titolo="Ordina"
            testo="Aggiunge al carrello e assegna ogni consumazione a se stesso, a un amico o al tavolo."
          />
          <Passo
            numero="3"
            titolo="Servi e incassa"
            testo="L'ordine arriva in coda allo staff. A fine serata il conto è già diviso per persona."
          />
        </div>
      </section>

      <section
        className="border-y px-6 py-16"
        style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
      >
        <div className="mx-auto max-w-3xl">
          <h2 className="text-sm font-medium uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            Moduli
          </h2>
          <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
            Si accendono uno alla volta, quando servono.
          </p>

          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {attivabili.map((m) => (
              <li key={m.key} className="card p-4">
                <div className="font-medium">{m.label}</div>
                <div className="mt-0.5 text-sm" style={{ color: "var(--muted)" }}>
                  {m.description}
                </div>
              </li>
            ))}
            {inArrivo.map((m) => (
              <li key={m.key} className="card p-4 opacity-70">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{m.label}</span>
                  <span className="badge badge-muted">in arrivo</span>
                </div>
                <div className="mt-0.5 text-sm" style={{ color: "var(--muted)" }}>
                  {m.description}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-16">
        <div className="card p-6">
          <h2 className="text-lg font-semibold">
            Non sostituisce la tua cassa
          </h2>
          <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
            Comanda sta <em>sopra</em> quello che hai già: non incassa
            denaro e non emette documenti fiscali. Lo scontrino continua a
            uscire dal tuo registratore telematico, esattamente come oggi.
            Niente migrazione, niente riconfigurazioni, niente formazione da
            capo.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-24">
        <div
          className="rounded-2xl px-6 py-10 text-center"
          style={{
            background: "linear-gradient(135deg, var(--hero-from), var(--hero-to))",
            color: "#ffffff",
          }}
        >
          <h2 className="text-2xl font-semibold">Vuoi vederlo sul tuo menu?</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/75">
            Prepariamo una demo con il vostro menu e il vostro logo, così
            vedete come apparirebbe davvero ai vostri clienti.
          </p>
          <a
            href={`mailto:${EMAIL_CONTATTO}`}
            className="btn mt-6"
            style={{
              background: "#ffffff",
              borderColor: "#ffffff",
              color: "#111111",
            }}
          >
            Scrivici
          </a>
        </div>
      </section>
    </main>
  );
}
