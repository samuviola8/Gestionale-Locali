import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

// Segreti dei locali salvati a database (oggi: la password della loro casella
// di posta).
//
// A database non ci vanno in chiaro. Non e' formalita': quella password apre
// la posta del ristorante, e un backup che gira per l'ufficio o una copia del
// database su un portatile la regalerebbero a chiunque. La chiave sta
// nell'ambiente, non nel database: chi ha solo la copia dei dati non ha niente.

const SALE = "comanda:segreti:v1";

// La chiave si deriva una volta sola: scrypt e' lento per progetto, e rifarlo
// a ogni mail vorrebbe dire pagarlo a ogni prenotazione.
let chiaveCache: Buffer | null | undefined;

function chiave(): Buffer | null {
  if (chiaveCache !== undefined) return chiaveCache;
  const segreto = process.env.APP_SECRET?.trim();
  // Sotto i 16 caratteri non e' un segreto, e' una parola: meglio rifiutarsi
  // di cifrare che dare l'impressione di averlo fatto.
  chiaveCache = segreto && segreto.length >= 16 ? scryptSync(segreto, SALE, 32) : null;
  return chiaveCache;
}

/** Se l'installazione puo' custodire segreti. Senza, le funzioni qui sotto
 *  non fingono: rifiutano, e la UI lo dice a chi sta configurando. */
export function cifraturaDisponibile(): boolean {
  return chiave() !== null;
}

export function cifra(testo: string): string | null {
  const k = chiave();
  if (!k || !testo) return null;

  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const dati = Buffer.concat([c.update(testo, "utf8"), c.final()]);
  // Il formato porta la versione davanti: il giorno che l'algoritmo cambia, i
  // valori vecchi restano leggibili invece di diventare rumore.
  return [
    "v1",
    iv.toString("base64"),
    c.getAuthTag().toString("base64"),
    dati.toString("base64"),
  ].join(":");
}

export function decifra(valore: string | null | undefined): string | null {
  const k = chiave();
  if (!k || !valore) return null;

  const [versione, iv, tag, dati] = valore.split(":");
  if (versione !== "v1" || !iv || !tag || !dati) return null;

  try {
    const d = createDecifratore(k, iv, tag);
    return Buffer.concat([
      d.update(Buffer.from(dati, "base64")),
      d.final(),
    ]).toString("utf8");
  } catch {
    // Chiave cambiata o valore manomesso: si risponde "non ce l'ho", non si
    // tira giu' la pagina che sta solo chiedendo se la posta e' configurata.
    return null;
  }
}

function createDecifratore(k: Buffer, iv: string, tag: string) {
  const d = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return d;
}
