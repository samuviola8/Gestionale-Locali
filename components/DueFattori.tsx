"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AvvioMail, AvvioTotp, Esito } from "@/lib/account";
import type { Metodo } from "@/lib/twofa";

// La verifica in due passaggi, dal punto di vista di chi la accende.
//
// Due modi, e si sceglie: l'app di autenticazione — che funziona anche col
// telefono senza campo e non dipende dalla posta — oppure un codice mandato
// alla propria casella, per chi un'app in piu' sul telefono non la vuole.
//
// Niente si accende senza una prova: prima si dimostra di saper leggere il
// codice, poi il lucchetto scatta. Al contrario, il primo a restare chiuso
// fuori sarebbe il titolare.

type Props = {
  metodo: Metodo | null;
  email: string;
  obbligatoria: boolean;
  segretiDisponibili: boolean;
  preparaApp: () => Promise<AvvioTotp>;
  confermaApp: (codice: string) => Promise<Esito>;
  preparaPosta: () => Promise<AvvioMail>;
  confermaPosta: (token: string, codice: string) => Promise<Esito>;
  spegni: () => Promise<Esito>;
  /** Dove mandare chi ha appena attivato. Serve alla pagina del primo
   *  accesso, che esiste solo finché c'è qualcosa da sistemare. */
  dopo?: string;
};

const NOMI: Record<Metodo, string> = {
  totp: "App di autenticazione",
  email: "Codice via mail",
};

export default function DueFattori(p: Props) {
  const router = useRouter();
  const [inCorso, avvia] = useTransition();
  const [fase, setFase] = useState<"riposo" | "app" | "posta">("riposo");
  const [qr, setQr] = useState<{ img: string; segreto: string } | null>(null);
  const [token, setToken] = useState("");
  const [codice, setCodice] = useState("");
  const [nota, setNota] = useState<{ ok: boolean; testo: string } | null>(null);

  function chiudi(messaggio: string) {
    setFase("riposo");
    setQr(null);
    setToken("");
    setCodice("");
    setNota({ ok: true, testo: messaggio });
    if (p.dopo) window.location.href = p.dopo;
    else router.refresh();
  }

  const inizia = (quale: "app" | "posta") =>
    avvia(async () => {
      setNota(null);
      setCodice("");
      if (quale === "app") {
        const r = await p.preparaApp();
        if (!r.ok) return setNota({ ok: false, testo: r.errore });
        setQr({ img: r.qr, segreto: r.segreto });
        setFase("app");
      } else {
        const r = await p.preparaPosta();
        if (!r.ok) return setNota({ ok: false, testo: r.errore });
        setToken(r.token);
        setNota({ ok: true, testo: r.avviso });
        setFase("posta");
      }
    });

  const conferma = () =>
    avvia(async () => {
      const r =
        fase === "app"
          ? await p.confermaApp(codice)
          : await p.confermaPosta(token, codice);
      if (!r.ok) return setNota({ ok: false, testo: r.errore });
      chiudi(r.messaggio ?? "Fatto.");
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {p.metodo ? (
          <>
            <span className="badge badge-ok">Attiva</span>
            <span className="text-sm">{NOMI[p.metodo]}</span>
          </>
        ) : (
          <>
            <span className="badge badge-muted">Non attiva</span>
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              Per entrare basta la password.
            </span>
          </>
        )}
        {p.obbligatoria && (
          <span className="badge badge-warn">Richiesta dal locale</span>
        )}
      </div>

      {fase === "riposo" && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-sm"
            disabled={inCorso || !p.segretiDisponibili}
            onClick={() => inizia("app")}
          >
            {p.metodo === "totp" ? "Rifai con un'altra app" : "Usa un'app di autenticazione"}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={inCorso}
            onClick={() => inizia("posta")}
          >
            {p.metodo === "email" ? "Rimanda un codice di prova" : "Ricevi un codice per mail"}
          </button>
          {p.metodo && !p.obbligatoria && (
            <button
              type="button"
              className="btn btn-sm"
              disabled={inCorso}
              onClick={() =>
                avvia(async () => {
                  const r = await p.spegni();
                  if (!r.ok) return setNota({ ok: false, testo: r.errore });
                  chiudi(r.messaggio ?? "Disattivata.");
                })
              }
            >
              Disattiva
            </button>
          )}
        </div>
      )}

      {!p.segretiDisponibili && fase === "riposo" && (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          L&apos;app di autenticazione richiede <code>APP_SECRET</code> configurato:
          senza, il segreto starebbe in chiaro a database. Il codice via mail
          funziona lo stesso.
        </p>
      )}

      {fase === "app" && qr && (
        <div className="space-y-3">
          <p className="text-sm">
            Inquadra il codice con Google Authenticator, Authy, 1Password o quello
            che usi, poi scrivi qui le sei cifre che compaiono.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr.img}
            alt="Codice QR per l'app di autenticazione"
            width={220}
            height={220}
            className="rounded-xl bg-white p-2"
          />
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Non riesci a inquadrarlo? Scrivi a mano questo:{" "}
            <code className="tnum">{qr.segreto}</code>
          </p>
        </div>
      )}

      {fase === "posta" && (
        <p className="text-sm">
          Abbiamo mandato sei cifre a <strong>{p.email}</strong>. Scrivile qui
          sotto: senza, non cambiamo niente.
        </p>
      )}

      {fase !== "riposo" && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={codice}
            onChange={(e) => setCodice(e.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            className="input tnum w-32 text-center"
          />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={inCorso || codice.length < 6}
            onClick={conferma}
          >
            {inCorso ? "Verifico…" : "Attiva"}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={inCorso}
            onClick={() => {
              setFase("riposo");
              setQr(null);
              setCodice("");
              setNota(null);
            }}
          >
            Annulla
          </button>
        </div>
      )}

      {nota && (
        <p
          role="status"
          className="text-xs"
          style={{ color: nota.ok ? "var(--ok)" : "var(--danger)" }}
        >
          {nota.testo}
        </p>
      )}
    </div>
  );
}
