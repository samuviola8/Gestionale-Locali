// Chi ha fatto questo software e dove trovarlo.
//
// La firma per esteso sta nella vetrina e nella dashboard dello staff, dove
// dall'altra parte c'e' qualcuno che con me ci parla. Nella dashboard non e'
// vanita': e' la riga che dice a chi scrivere quando qualcosa non funziona, ed
// e' il motivo per cui le sta accanto il pulsante delle segnalazioni.
//
// In fondo al menu del cliente va invece <MarchioMenu>, che e' un'altra cosa:
// li' il nome di una persona non dice niente a chi sta cercando il gin, mentre
// il nome del prodotto e' quello che il titolare del locale di fronte, seduto
// a bere qualcosa, puo' ricordarsi.

const SITO = "samuviola.dev";
const AUTORE = "Samuele Viola";

export default function Firma({
  compatta = false,
}: {
  /** Versione da barra laterale: due righe strette invece di una lunga. */
  compatta?: boolean;
}) {
  const link = (
    <a
      href={`https://${SITO}`}
      target="_blank"
      rel="noreferrer"
      className="underline underline-offset-2 hover:no-underline"
      style={{ color: "inherit" }}
    >
      {SITO}
    </a>
  );

  if (compatta) {
    return (
      <p
        className="px-3 pt-3 text-[11px] leading-snug"
        style={{ color: "var(--muted)" }}
      >
        Sviluppato e mantenuto da
        <br />
        {AUTORE} · {link}
      </p>
    );
  }

  return (
    <p className="text-sm" style={{ color: "var(--muted)" }}>
      Sviluppato e mantenuto da {AUTORE} · {link}
    </p>
  );
}

// La riga in fondo alla pagina del cliente. Piccola e in coda, non fissa: chi
// ordina non deve averla fra i piedi. Porta alla vetrina, dove chi e' curioso
// trova il prodotto per intero — e la firma.
//
// Si spegne per locale (`tenants.menu_branding`): il menu, e il sito da cui si
// ordina, il locale li presenta come suoi, e chi non la vuole deve poter dire
// di no senza chiamarmi.
export function MarchioMenu({
  /** Il verbo di questa pagina: al tavolo si sfoglia un menu, da /ordina si
      ordina. La riga e' la stessa firma, ma dice la cosa giusta. */
  cosa = "Menu",
}: {
  cosa?: string;
}) {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000";
  const proto = process.env.NODE_ENV === "production" ? "https" : "http";
  const vetrina = root.includes("localhost")
    ? `${proto}://${root}`
    : `${proto}://comanda.${root}`;

  return (
    <p
      className="mt-8 pt-4 text-center text-[11px]"
      style={{ borderTop: "1px solid var(--border)", color: "var(--muted)" }}
    >
      <a
        href={vetrina}
        target="_blank"
        rel="noreferrer"
        style={{ color: "inherit" }}
      >
        {cosa} con <span className="marchio-link font-medium">Comanda</span>
      </a>
    </p>
  );
}
