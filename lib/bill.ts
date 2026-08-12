// Calcolo del conto di un tavolo.
//
// Le voci messe su "Condiviso" non appartengono a nessuno: il loro costo si
// divide tra tutte le persone sedute. Allo stesso modo il coperto si moltiplica
// per il numero di persone. Nessuna delle due cose e' una riga d'ordine: si
// calcolano qui, cosi' la comanda che arriva in cucina resta quello che e'
// stato davvero ordinato.

export const ALIAS_CONDIVISO = "Condiviso";

export type BillLine = {
  // Id della riga d'ordine: serve al cassiere per annullarla dal conto.
  id?: string;
  name: string;
  quantity: number;
  priceCents: number;
  paid: boolean;
  // Cosa aveva chiesto il cliente, e se il barman ne ha corretto il prezzo.
  note?: string | null;
  priceAdjusted?: boolean;
  // Voce annullata dal locale: resta in elenco barrata, ma non si paga.
  voided?: boolean;
};

// Le voci annullate restano visibili ma fuori da ogni somma: e' l'unica cosa
// che le distingue da una cancellazione.
function daPagare(items: BillLine[]): BillLine[] {
  return items.filter((i) => !i.voided);
}

export function totaleVoci(items: BillLine[]): number {
  return daPagare(items).reduce((s, i) => s + i.priceCents * i.quantity, 0);
}

export type BillPerson = {
  alias: string;
  items: BillLine[];
  // Totale delle sole voci intestate a questa persona.
  itemsTotal: number;
  // Parte di "Condiviso" a suo carico.
  sharedQuota: number;
  coverCharge: number;
  // Quanto deve in tutto.
  total: number;
  paid: boolean;
  // Posto al tavolo di chi non ha ordinato nulla a proprio nome: paga solo
  // quota e coperto, ma paga come tutti gli altri.
  placeholder: boolean;
};

export type BillTable = {
  tableNumber: number;
  partySize: number;
  // Una voce per ogni persona seduta, comprese quelle che hanno solo diviso.
  people: BillPerson[];
  sharedItems: BillLine[];
  sharedTotal: number;
  coverChargeCents: number;
  total: number;
  incassato: number;
  hasPending: boolean;
};

// Divide un importo in n parti intere, distribuendo i centesimi di resto sulle
// prime: la somma delle parti torna sempre esattamente all'importo di partenza.
export function splitCents(amount: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(amount / n);
  const resto = amount - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < resto ? 1 : 0));
}

export function buildTable(input: {
  tableNumber: number;
  byAlias: Map<string, BillLine[]>;
  declaredPartySize: number | null;
  coverChargeCents: number;
  // alias -> importo gia' incassato da quella persona.
  settled: Map<string, number>;
  hasPending: boolean;
}): BillTable {
  const { tableNumber, byAlias, coverChargeCents, settled, hasPending } = input;

  const sharedItems = byAlias.get(ALIAS_CONDIVISO) ?? [];
  const sharedTotal = totaleVoci(sharedItems);

  const names = [...byAlias.keys()].filter((a) => a !== ALIAS_CONDIVISO);

  // Se nessuno ha dichiarato quante persone sono, si contano quelle che hanno
  // ordinato a proprio nome: e' la stima piu' prudente.
  const partySize = Math.max(
    input.declaredPartySize ?? 0,
    names.length,
    names.length ? 1 : 0
  );

  const quote = splitCents(sharedTotal, partySize);

  // Un posto per ogni persona seduta: prima chi ha ordinato a proprio nome,
  // poi gli altri. Anche chi ha solo diviso deve poter pagare la sua parte.
  const posti: { alias: string; items: BillLine[]; placeholder: boolean }[] = [
    ...names.map((alias) => ({
      alias,
      items: byAlias.get(alias)!,
      placeholder: false,
    })),
    ...Array.from({ length: Math.max(0, partySize - names.length) }, (_, k) => ({
      alias: `Persona ${names.length + k + 1}`,
      items: [] as BillLine[],
      placeholder: true,
    })),
  ];

  const people: BillPerson[] = posti.map((posto, i) => {
    const items = posto.items;
    const daSaldare = daPagare(items);
    const itemsTotal = totaleVoci(items);
    const sharedQuota = quote[i] ?? 0;
    const extras = sharedQuota + coverChargeCents;
    // Una voce annullata non tiene aperto il conto di nessuno, ma nemmeno lo
    // chiude: chi resta con tutto annullato e zero da pagare non ha "pagato".
    const paid =
      daSaldare.every((x) => x.paid) &&
      (extras === 0 || settled.has(posto.alias)) &&
      (daSaldare.length > 0 || extras > 0);

    // Chi ha gia' pagato vale l'importo che ha versato: se dopo si corregge il
    // numero di persone, la sua quota non cambia retroattivamente.
    const incassatoDaLui = settled.get(posto.alias);
    const total =
      paid && incassatoDaLui !== undefined
        ? incassatoDaLui
        : itemsTotal + sharedQuota + coverChargeCents;

    return {
      alias: posto.alias,
      items,
      itemsTotal,
      sharedQuota,
      coverCharge: coverChargeCents,
      total,
      paid,
      placeholder: posto.placeholder,
    };
  })
    // Un posto che non deve nulla non si mostra: non c'e' niente da incassare.
    // Nemmeno se ha righe, se sono tutte annullate.
    .filter((p) => p.total > 0 || daPagare(p.items).length > 0);

  const total = people.reduce((s, p) => s + p.total, 0);

  // Se il numero di persone cambia dopo un incasso, il posto pagato puo' non
  // comparire piu' con lo stesso nome: quei soldi sono comunque entrati.
  const aliasMostrati = new Set(people.map((p) => p.alias));
  const incassatoOrfano = [...settled.entries()]
    .filter(([alias]) => !aliasMostrati.has(alias))
    .reduce((s, [, importo]) => s + importo, 0);

  const incassato =
    people.filter((p) => p.paid).reduce((s, p) => s + p.total, 0) +
    incassatoOrfano;

  return {
    tableNumber,
    partySize,
    people,
    sharedItems,
    sharedTotal,
    coverChargeCents,
    total,
    incassato,
    hasPending,
  };
}
