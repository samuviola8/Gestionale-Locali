// Il freno per quello che sta aperto a chiunque: la prenotazione, l'ordine dal
// sito, la ricerca degli indirizzi.
//
// Un contatore in memoria e non a database: il sito gira su un processo solo, e
// quello che serve fermare e' chi rilancia lo stesso modulo in ciclo o tiene il
// dito su un tasto — non un attacco vero, che si ferma altrove. Riavviando il
// processo si azzera, ed e' accettabile: e' un freno, non una guardia.

type Colpi = number[];

const registro = new Map<string, Colpi>();

// Oltre questo numero di chiavi si fa pulizia: senza, un processo acceso da
// settimane si porta dietro un indirizzo IP per ogni curioso passato di qui.
const MAX_CHIAVI = 500;

export function troppeRichieste(
  chiave: string,
  limite: number,
  finestraMs: number
): boolean {
  const ora = Date.now();
  const recenti = (registro.get(chiave) ?? []).filter(
    (t) => ora - t < finestraMs
  );

  if (recenti.length >= limite) {
    // Si riscrive lo stesso l'elenco ripulito: le vecchie non devono restare a
    // pesare solo perche' il tentativo e' stato respinto.
    registro.set(chiave, recenti);
    return true;
  }

  recenti.push(ora);
  registro.set(chiave, recenti);

  if (registro.size > MAX_CHIAVI) {
    for (const [k, tempi] of registro) {
      if (tempi.every((t) => ora - t >= finestraMs)) registro.delete(k);
    }
  }
  return false;
}
