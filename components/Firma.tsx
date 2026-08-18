// Chi ha fatto questo software e dove trovarlo.
//
// Sta nella vetrina e nella dashboard dello staff, non sul menu che vede il
// cliente al tavolo: quella pagina il locale la presenta come sua, con il suo
// logo e i suoi colori, e una firma altrui sotto non ci va.
//
// Nella dashboard non e' vanita': e' la riga che dice a chi scrivere quando
// qualcosa non funziona, ed e' il motivo per cui le sta accanto il pulsante
// delle segnalazioni.

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
