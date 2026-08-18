import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import QRCode from "qrcode";

// Codici a sei cifre delle app di autenticazione (TOTP, RFC 6238).
//
// Scritto qui invece di aggiungere una libreria: e' un HMAC-SHA1 su un
// contatore di trenta secondi, sta in cinquanta righe, e ogni dipendenza in
// piu' sulla strada del login e' una cosa che un giorno va aggiornata di
// corsa. Il QR lo disegna `qrcode`, che c'era gia' per i tavoli.

const PASSO_SECONDI = 30;
const CIFRE = 6;
// Una finestra avanti e una indietro: l'orologio del telefono e quello del
// server non sono mai d'accordo al secondo, e chi digita ci mette qualche
// istante. Piu' larga di cosi' allungherebbe la vita di un codice rubato.
const FINESTRA = 1;

const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32(dati: Buffer): string {
  let bit = 0;
  let valore = 0;
  let out = "";
  for (const byte of dati) {
    valore = (valore << 8) | byte;
    bit += 8;
    while (bit >= 5) {
      out += ALFABETO[(valore >>> (bit - 5)) & 31];
      bit -= 5;
    }
  }
  if (bit > 0) out += ALFABETO[(valore << (5 - bit)) & 31];
  return out;
}

function daBase32(s: string): Buffer | null {
  const pulito = s.toUpperCase().replace(/[\s=-]/g, "");
  let bit = 0;
  let valore = 0;
  const byte: number[] = [];
  for (const c of pulito) {
    const i = ALFABETO.indexOf(c);
    if (i < 0) return null;
    valore = (valore << 5) | i;
    bit += 5;
    if (bit >= 8) {
      byte.push((valore >>> (bit - 8)) & 255);
      bit -= 8;
    }
  }
  return byte.length ? Buffer.from(byte) : null;
}

/** Un segreto nuovo, in base32 come lo vogliono le app. */
export function nuovoSegreto(): string {
  return base32(randomBytes(20));
}

/** Il segreto scritto a gruppi di quattro: chi non inquadra il QR lo deve
 *  ricopiare a mano, e venti caratteri di fila si sbagliano. */
export function segretoLeggibile(segreto: string): string {
  return segreto.replace(/(.{4})/g, "$1 ").trim();
}

export function urlOtpauth(
  segreto: string,
  conto: string,
  emittente: string
): string {
  const e = encodeURIComponent(emittente);
  const c = encodeURIComponent(conto);
  return `otpauth://totp/${e}:${c}?secret=${segreto}&issuer=${e}&algorithm=SHA1&digits=${CIFRE}&period=${PASSO_SECONDI}`;
}

/** Il QR come immagine incorporata: il segreto non deve passare da un file
 *  servito a parte, che resterebbe scaricabile anche dopo. */
export async function qrOtpauth(url: string): Promise<string> {
  return QRCode.toDataURL(url, { margin: 1, width: 220 });
}

function codiceAl(segreto: Buffer, contatore: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(contatore));
  const h = createHmac("sha1", segreto).update(buf).digest();
  const off = h[h.length - 1] & 15;
  const num =
    ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(num % 10 ** CIFRE).padStart(CIFRE, "0");
}

export function verificaTotp(
  segreto: string,
  codice: string,
  adesso: number = Date.now()
): boolean {
  const chiave = daBase32(segreto);
  const dato = codice.replace(/\D/g, "");
  if (!chiave || dato.length !== CIFRE) return false;

  const contatore = Math.floor(adesso / 1000 / PASSO_SECONDI);
  const atteso = Buffer.from(dato);
  for (let d = -FINESTRA; d <= FINESTRA; d++) {
    const c = Buffer.from(codiceAl(chiave, contatore + d));
    if (timingSafeEqual(c, atteso)) return true;
  }
  return false;
}
