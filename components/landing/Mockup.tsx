// Mockup dell'interfaccia vera, disegnati. Uno screenshot invecchia al primo
// ritocco e una foto di repertorio mostra un locale che non esiste: qui si
// vede quello che il prodotto fa davvero, con le proporzioni giuste.

function Riga({ w, className }: { w: string; className?: string }) {
  return <div className={"lp-riga " + (className ?? "")} style={{ width: w }} />;
}

// Il telefono del cliente: menu, una consumazione con la richiesta scritta,
// e il carrello in fondo.
export function SchermoCliente() {
  return (
    <div className="lp-telefono">
      <div className="lp-schermo">
        <div className="flex items-center justify-between">
          <span
            className="lp-pill"
            style={{ background: "rgba(255,255,255,0.08)", color: "#cfd2cf" }}
          >
            Tavolo 7
          </span>
          <span style={{ fontSize: 10, color: "#8c918d" }}>Ordina al tavolo</span>
        </div>

        <div className="mt-3 flex gap-1.5">
          {["Signature", "Spritz", "Food"].map((c, i) => (
            <span
              key={c}
              className="lp-pill"
              style={
                i === 0
                  ? { background: "#e0b45e", color: "#1a1a1a" }
                  : { background: "rgba(255,255,255,0.06)", color: "#9aa0a0" }
              }
            >
              {c}
            </span>
          ))}
        </div>

        <div className="mt-3 space-y-2">
          <div className="lp-card-menu">
            <div className="lp-thumb" />
            <div className="min-w-0 flex-1">
              <div style={{ fontSize: 11, fontWeight: 600 }}>Rose St-Germain</div>
              <div style={{ fontSize: 9, color: "#8c918d" }}>
                St-Germain, menta, bergamotto
              </div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 600 }}>€14</span>
          </div>

          <div className="lp-card-menu">
            <div
              className="lp-thumb"
              style={{
                background:
                  "linear-gradient(140deg, rgba(120,190,255,0.42), rgba(120,190,255,0.1))",
              }}
            />
            <div className="min-w-0 flex-1">
              <div style={{ fontSize: 11, fontWeight: 600 }}>Basil Gin Sour</div>
              <div
                style={{
                  fontSize: 9,
                  color: "#e0b45e",
                  fontStyle: "italic",
                  marginTop: 2,
                }}
              >
                «senza ghiaccio»
              </div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 600 }}>€12</span>
          </div>
        </div>

        <div
          className="mt-3 flex items-center justify-between rounded-xl px-3 py-2.5"
          style={{ background: "#e0b45e", color: "#1a1a1a" }}
        >
          <span style={{ fontSize: 11, fontWeight: 600 }}>Vedi carrello · 3</span>
          <span style={{ fontSize: 12, fontWeight: 700 }}>€38,00</span>
        </div>
      </div>
    </div>
  );
}

// Quello che vede chi prepara: la comanda con l'attesa e la richiesta in
// evidenza.
export function PannelloCoda({ className }: { className?: string }) {
  return (
    <div className={"lp-pannello " + (className ?? "")}>
      <div className="flex items-center justify-between">
        <span style={{ fontSize: 12, fontWeight: 600 }}>Tavolo 7</span>
        <span
          className="lp-pill"
          style={{ background: "var(--warn-bg)", color: "var(--warn)" }}
        >
          6 min
        </span>
      </div>
      <div className="mt-2 space-y-1.5" style={{ color: "var(--text)" }}>
        <div style={{ fontSize: 11 }}>
          <span style={{ fontWeight: 700 }}>1×</span> Basil Gin Sour
        </div>
        <div
          className="rounded-md px-2 py-1"
          style={{
            background: "var(--warn-bg)",
            borderLeft: "2px solid var(--warn)",
            fontSize: 10,
            fontStyle: "italic",
          }}
        >
          senza ghiaccio
        </div>
        <div style={{ fontSize: 11 }}>
          <span style={{ fontWeight: 700 }}>2×</span> Rose St-Germain
        </div>
      </div>
      <div
        className="mt-2.5 rounded-lg py-1.5 text-center"
        style={{ background: "var(--brand)", color: "var(--brand-on)", fontSize: 11 }}
      >
        Inizia a preparare
      </div>
    </div>
  );
}

// Il conto gia' diviso, che e' la parte che al banco fa perdere piu' tempo.
export function PannelloConto({ className }: { className?: string }) {
  const persone = [
    { nome: "Anna", tot: "€17,50" },
    { nome: "Marco", tot: "€14,00" },
    { nome: "Giulia", tot: "€12,50" },
  ];
  return (
    <div className={"lp-pannello " + (className ?? "")}>
      <div className="flex items-center justify-between">
        <span style={{ fontSize: 12, fontWeight: 600 }}>Conto tavolo 7</span>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>€44,00</span>
      </div>
      <div className="mt-2 space-y-1">
        {persone.map((p, i) => (
          <div
            key={p.nome}
            className="flex items-center justify-between rounded-md px-2 py-1.5"
            style={{
              background: i === 0 ? "var(--ok-bg)" : "var(--surface-2)",
              fontSize: 11,
            }}
          >
            <span>{p.nome}</span>
            <span style={{ fontWeight: 600 }}>
              {i === 0 ? "Pagato" : p.tot}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2" style={{ fontSize: 10, color: "var(--muted)" }}>
        Condiviso e coperto già divisi
      </div>
    </div>
  );
}

// La prenotazione come la vede chi arriva sul sito del locale: tre scelte e
// via. Gli orari mostrati sono quelli con un tavolo libero davvero, ed e' la
// cosa che qui va fatta vedere — non un calendario generico.
export function PannelloPrenotazione() {
  const scelte: [string, string[], number][] = [
    ["Quante persone", ["2", "3", "4", "5", "6"], 2],
    ["Che giorno", ["ven 12", "sab 13", "dom 14"], 1],
    ["A che ora", ["19:30", "20:00", "20:30", "21:00"], 1],
  ];

  return (
    <div className="lp-vetro w-full max-w-sm p-5">
      <div className="flex items-baseline justify-between">
        <span className="lp-occhiello">Prenotazione</span>
        {/* Nessun nome di locale: la vetrina mostra il prodotto, e un cliente
            vero messo qui dentro sembrerebbe una referenza, non un esempio. */}
        <span style={{ fontSize: 11, color: "var(--muted)" }}>
          Dal sito del locale
        </span>
      </div>

      {scelte.map(([titolo, voci, attivo]) => (
        <div key={titolo} className="mt-3.5">
          <div style={{ fontSize: 11, color: "var(--muted)" }}>{titolo}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {voci.map((v, i) => (
              <span
                key={v}
                className="lp-chip"
                data-attivo={i === attivo ? "si" : "no"}
              >
                {v}
              </span>
            ))}
          </div>
        </div>
      ))}

      <div
        className="mt-4 flex items-center justify-between rounded-xl px-3 py-2.5"
        style={{
          background: "var(--lp-accent-soft)",
          color: "var(--lp-accent)",
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        <span>4 persone · sab 13 · 20:00</span>
        <span>Tavolo 6</span>
      </div>

      <div
        className="mt-2 rounded-xl py-2 text-center"
        style={{
          background: "var(--brand)",
          color: "var(--brand-on)",
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        Prenota il tavolo
      </div>
    </div>
  );
}

// La rubrica come la incontra chi batte l'ordine: tre lettere nel nome e
// l'elenco scende. Quello che va fatto vedere e' il dopo — i campi gia' pieni,
// civico e citofono compresi — perche' e' li' che sta il tempo risparmiato e
// il civico che non si sbaglia.
export function PannelloRubrica() {
  const trovati: [string, string, string][] = [
    ["Marco Rinaldi", "333 1234567", "Via Roma 12, 95030 Nicolosi"],
    ["Marta Grasso", "340 9876543", "Corso Italia 5, 95129 Catania"],
  ];
  const compilati: [string, string][] = [
    ["Telefono", "333 1234567"],
    ["Indirizzo", "Via Roma 12"],
    ["CAP e comune", "95030 Nicolosi"],
    ["Note", "Citofono rotto, 2° piano"],
  ];

  return (
    <div className="lp-vetro w-full max-w-sm p-5">
      <div className="flex items-baseline justify-between">
        <span className="lp-occhiello">Rubrica</span>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>
          Cassa · domicilio
        </span>
      </div>

      <div className="mt-3.5" style={{ fontSize: 11, color: "var(--muted)" }}>
        Nome di chi ordina
      </div>
      <div
        className="mt-1.5 rounded-xl px-3 py-2"
        style={{
          border: "1px solid var(--lp-accent)",
          background: "var(--surface)",
          fontSize: 12,
        }}
      >
        mar<span className="lp-cursore" aria-hidden="true" />
      </div>

      <div
        className="mt-1.5 overflow-hidden rounded-xl p-1"
        style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
      >
        {trovati.map(([nome, tel, dove], i) => (
          <div
            key={nome}
            className="rounded-lg px-2.5 py-1.5"
            style={i === 0 ? { background: "var(--lp-accent-soft)" } : undefined}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span style={{ fontSize: 11, fontWeight: 600 }}>{nome}</span>
              <span style={{ fontSize: 10, color: "var(--muted)" }}>{tel}</span>
            </div>
            <div style={{ fontSize: 10, color: "var(--muted)" }}>{dove}</div>
          </div>
        ))}
      </div>

      <div
        className="mt-3.5 pt-3"
        style={{ borderTop: "1px dashed var(--border)" }}
      >
        <div style={{ fontSize: 10, color: "var(--muted)" }}>
          Si compila da solo
        </div>
        <div className="mt-1.5 space-y-1">
          {compilati.map(([voce, valore]) => (
            <div key={voce} className="flex items-baseline justify-between gap-3">
              <span style={{ fontSize: 10, color: "var(--muted)" }}>{voce}</span>
              <span style={{ fontSize: 11, fontWeight: 600 }}>{valore}</span>
            </div>
          ))}
        </div>
      </div>

      <div
        className="mt-3 flex items-center gap-2 rounded-lg px-2.5 py-2"
        style={{ background: "var(--surface-2)" }}
      >
        <span
          className="flex h-3.5 w-3.5 flex-none items-center justify-center rounded"
          style={{ background: "var(--lp-accent)", color: "var(--surface)", fontSize: 9 }}
          aria-hidden="true"
        >
          ✓
        </span>
        <span style={{ fontSize: 11 }}>Salva in rubrica</span>
      </div>
    </div>
  );
}

// Mockup piu' piccoli, per le sezioni esplicative.
export function MiniQr() {
  return (
    <div className="flex items-center gap-3">
      <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true">
        <rect width="52" height="52" rx="8" fill="#ffffff" />
        {[
          [6, 6],
          [32, 6],
          [6, 32],
        ].map(([x, y]) => (
          <g key={`${x}-${y}`}>
            <rect x={x} y={y} width="14" height="14" rx="3" fill="#111" />
            <rect x={x + 4} y={y + 4} width="6" height="6" rx="1.5" fill="#fff" />
          </g>
        ))}
        {[
          [26, 26],
          [34, 26],
          [26, 34],
          [42, 34],
          [34, 42],
          [42, 26],
          [26, 42],
        ].map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="6" height="6" rx="1" fill="#111" />
        ))}
      </svg>
      <div className="min-w-0 flex-1 space-y-1.5">
        <Riga w="80%" />
        <Riga w="55%" />
      </div>
    </div>
  );
}

export function MiniStampa() {
  return (
    <div
      className="rounded-lg p-2.5"
      style={{ background: "var(--surface-2)", fontFamily: "ui-monospace, monospace" }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em" }}>
        CUCINA
      </div>
      <div style={{ fontSize: 9, color: "var(--muted)" }}>
        Asporto · Marco — per le 20:30
      </div>
      <div
        style={{ borderTop: "1px dashed var(--border)", margin: "6px 0" }}
      />
      <div style={{ fontSize: 10, fontWeight: 700 }}>2× Patata fresca stick</div>
      <div style={{ fontSize: 9, fontStyle: "italic", paddingLeft: 14 }}>
        » senza sale
      </div>
    </div>
  );
}
