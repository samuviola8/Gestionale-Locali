import { dataISO } from "@/lib/orari";

// Formattazioni pure, usabili anche dai componenti client: sta a parte da
// lib/menu.ts perche' quello importa il database.

// 700 -> "€7,00"
export function formatPrice(cents: number): string {
  return "€" + (cents / 100).toFixed(2).replace(".", ",");
}

// Come si leggono in sala i tavoli di un gruppo: "Tavolo 7" o "Tavoli 4+5".
// Vale per la prenotazione che li accosta in anticipo e per il cameriere che
// li unisce sul momento: e' la stessa etichetta, e deve restare la stessa.
export function etichettaTavoli(numeri: number[]): string | null {
  if (!numeri.length) return null;
  return numeri.length === 1
    ? `Tavolo ${numeri[0]}`
    : `Tavoli ${numeri.join("+")}`;
}

// Perche' un tavolo risulta occupato. Non e' un dettaglio da nascondere: «hanno
// scansionato il QR» e «c'e' un conto aperto» sono due gradi di certezza
// diversi, e chi guarda la sala deve sapere quale dei due sta leggendo.
export type OrigineOccupazione = "sala" | "ordine" | "qr";

export const ORIGINE_ETICHETTA: Record<OrigineOccupazione, string> = {
  sala: "aperto in sala",
  ordine: "ha ordinato",
  qr: "solo QR",
};

// Da quanto sono seduti, in parole: "35 min", "1h 20", "3 h". Sopra le tre ore
// si smette di contare i minuti: a quel punto la cifra che conta e' l'ora.
export function daQuanto(daMs: number, adessoMs: number): string {
  const minuti = Math.max(0, Math.floor((adessoMs - daMs) / 60000));
  if (minuti === 0) return "adesso";
  if (minuti < 60) return `${minuti} min`;
  const ore = Math.floor(minuti / 60);
  const resto = minuti % 60;
  if (ore >= 3 || resto === 0) return `${ore} h`;
  return `${ore}h ${String(resto).padStart(2, "0")}`;
}


// I chilometri si scrivono con la virgola: "0,6 km", non "0.6". E si fermano al
// primo decimale — la distanza e' una stima, e un secondo decimale
// prometterebbe una precisione che non c'e'.
export function formatKm(km: number): string {
  return `${String(Math.round(km * 10) / 10).replace(".", ",")} km`;
}

// Una data ridotta a pillola: "Oggi", "Domani", poi il giorno della settimana
// con numero e mese. La usano la prenotazione e l'ordine dal web, che scelgono
// il giorno nello stesso modo — una fila di pillole da scorrere col pollice.
export type GiornoScelta = {
  iso: string;
  nome: string;
  numero: string;
  mese: string;
};

export function pilloleGiorni(giorni: Date[], adesso: Date): GiornoScelta[] {
  const aMezzanotte = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

  return giorni.map((d) => {
    const giorniDiDistanza = Math.round(
      (aMezzanotte(d) - aMezzanotte(adesso)) / 86400000
    );
    return {
      iso: dataISO(d),
      nome:
        giorniDiDistanza === 0
          ? "Oggi"
          : giorniDiDistanza === 1
            ? "Domani"
            : d.toLocaleDateString("it-IT", { weekday: "short" }),
      numero: String(d.getDate()),
      mese: d.toLocaleDateString("it-IT", { month: "short" }).replace(".", ""),
    };
  });
}
