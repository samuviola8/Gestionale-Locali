// Calcolo del conto di un tavolo.
//
// Le voci messe su un gruppo non appartengono a nessuno: il loro costo si
// divide tra le persone del gruppo. Allo stesso modo il coperto si moltiplica
// per il numero di persone. Nessuna delle due cose e' una riga d'ordine: si
// calcolano qui, cosi' la comanda che arriva in cucina resta quello che e'
// stato davvero ordinato.

// Un alias non e' per forza una persona: puo' nominarne piu' d'una, ed e' cosi'
// che in due si divide una pizza senza tirarci dentro tutto il tavolo.
// "Condiviso" e' il gruppo di tutti, e resta un caso a se' perche' comprende
// anche chi al tavolo non ha ordinato niente e chi si siede dopo.
export const ALIAS_CONDIVISO = "Condiviso";

// Separatore dei nomi dentro a un alias di gruppo. Sta nell'alias e non in una
// tabella a parte perche' un gruppo e' esattamente questo: un intestatario che
// paga in piu' persone, e il conto sa gia' incolonnare per alias.
const SEPARATORE = " & ";

// L'alias di un gruppo: nomi unici e in ordine, cosi' le stesse persone
// producono sempre la stessa chiave, anche se le si spunta in ordine diverso.
export function aliasGruppo(nomi: string[]): string {
  const unici = [...new Set(nomi.map((n) => n.trim()).filter(Boolean))];
  unici.sort((a, b) => a.localeCompare(b, "it"));
  return unici.join(SEPARATORE);
}

// Vero se l'alias e' un gruppo e non una persona: nessuno paga a suo nome, la
// sua spesa esiste solo ripartita in quote.
export function eGruppo(alias: string): boolean {
  return alias === ALIAS_CONDIVISO || alias.includes(SEPARATORE);
}

// I nomi dentro a un alias di gruppo. "Condiviso" non ne elenca nessuno: chi
// se lo divide lo dice il numero di persone sedute, non l'alias.
export function membriDi(alias: string): string[] {
  if (alias === ALIAS_CONDIVISO) return [];
  return alias
    .split(SEPARATORE)
    .map((n) => n.trim())
    .filter(Boolean);
}

// Il separatore e' riservato: un nome che se lo porta dentro si leggerebbe come
// due persone. Si toglie quando il nome viene scritto, che e' l'unico momento
// in cui c'e' ancora qualcuno a cui la correzione non cambia il conto.
export function pulisciNome(nome: string): string {
  return nome.replace(/&/g, " ").replace(/\s+/g, " ").trim();
}

// L'alias come arriva da un telefono, riportato in forma canonica: adesso che
// un alias ha una struttura dentro, riceverlo cosi' com'e' vorrebbe dire far
// decidere al cliente quante persone compaiono sul conto e come si chiamano.
export function normalizzaAlias(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  if (!t || t === "Tavolo") return "Tavolo";
  if (t === ALIAS_CONDIVISO) return ALIAS_CONDIVISO;
  const membri = membriDi(t)
    .map((n) => pulisciNome(n).slice(0, 24))
    .filter(Boolean)
    .slice(0, 12);
  return membri.length ? aliasGruppo(membri) : "Tavolo";
}

// "Marco", "Marco e Luca", "Marco, Luca e Sara".
function elenco(nomi: string[]): string {
  if (nomi.length <= 1) return nomi.join("");
  return `${nomi.slice(0, -1).join(", ")} e ${nomi[nomi.length - 1]}`;
}

// Come si legge una quota sul conto di chi la paga: dire "Condiviso" anche per
// una pizza in due nasconderebbe proprio l'informazione che serve, cioe' con
// chi l'ha divisa.
function etichettaQuota(alias: string, io: string): string {
  if (alias === ALIAS_CONDIVISO) return "Quota condiviso";
  const altri = membriDi(alias).filter((m) => m !== io);
  return altri.length ? `Diviso con ${elenco(altri)}` : "Diviso";
}

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

// Quello che una persona paga di un gruppo a cui partecipa.
export type BillShare = {
  // Alias del gruppo da cui arriva la quota.
  alias: string;
  // Come si legge sul suo conto: "Quota condiviso", "Diviso con Marco".
  label: string;
  amountCents: number;
};

export type BillPerson = {
  alias: string;
  items: BillLine[];
  // Totale delle sole voci intestate a questa persona.
  itemsTotal: number;
  // Una riga per ogni gruppo di cui fa parte: chi divide la pizza in due e il
  // vino con tutti paga due quote diverse, e deve poterle distinguere.
  shares: BillShare[];
  // Somma delle quote: e' quello che entra nel totale.
  sharedQuota: number;
  coverCharge: number;
  // Quanto deve in tutto.
  total: number;
  paid: boolean;
  // Posto al tavolo di chi non ha ordinato nulla a proprio nome: paga solo
  // quota e coperto, ma paga come tutti gli altri.
  placeholder: boolean;
};

// Le voci di un gruppo, cosi' come si mostrano a fondo conto.
export type BillSharedGroup = {
  // "Condiviso", oppure i nomi di chi se lo divide.
  alias: string;
  // In quante parti si divide.
  teste: number;
  items: BillLine[];
  total: number;
};

export type BillTable = {
  // Identificatore del conto. In sala e' il tavolo, che raccoglie piu' ordini;
  // fuori dalla sala e' il singolo ordine, perche' non c'e' un posto a cui
  // appoggiarsi e ogni asporto e' una cosa a se'.
  key: string;
  channel: string;
  // Come si chiama questo conto a schermo: "Tavolo 3", "Asporto · Marco".
  label: string;
  tableNumber: number;
  orderId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  // La consegna e' un servizio, non una consumazione: entra nel totale ma non
  // nella comanda, e non si divide fra nessuno.
  deliveryFeeCents: number;
  partySize: number;
  // Una voce per ogni persona seduta, comprese quelle che hanno solo diviso.
  people: BillPerson[];
  // Un blocco per ogni gruppo che ha ordinato qualcosa.
  shared: BillSharedGroup[];
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
  key: string;
  channel: string;
  label: string;
  tableNumber: number;
  orderId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
  deliveryFeeCents?: number;
  byAlias: Map<string, BillLine[]>;
  declaredPartySize: number | null;
  coverChargeCents: number;
  // alias -> importo gia' incassato da quella persona.
  settled: Map<string, number>;
  hasPending: boolean;
}): BillTable {
  const { tableNumber, byAlias, coverChargeCents, settled, hasPending } = input;
  const deliveryFeeCents = input.deliveryFeeCents ?? 0;

  const aliasGruppi = [...byAlias.keys()].filter(eGruppo);

  // Chi sta al tavolo: chi ha ordinato a proprio nome, piu' chi compare solo
  // dentro a un gruppo. Il secondo caso prima non aveva un posto suo e finiva
  // tra gli anonimi, pur avendo un nome che qualcuno aveva scritto.
  const names = [...byAlias.keys()].filter((a) => !eGruppo(a));
  for (const alias of aliasGruppi) {
    for (const m of membriDi(alias)) if (!names.includes(m)) names.push(m);
  }

  // Se nessuno ha dichiarato quante persone sono, si contano quelle che hanno
  // ordinato a proprio nome: e' la stima piu' prudente.
  const partySize = Math.max(
    input.declaredPartySize ?? 0,
    names.length,
    names.length ? 1 : 0
  );

  // Un posto per ogni persona seduta: prima chi ha ordinato a proprio nome,
  // poi gli altri. Anche chi ha solo diviso deve poter pagare la sua parte.
  const posti: { alias: string; items: BillLine[]; placeholder: boolean }[] = [
    // Chi e' arrivato qui solo perche' nominato in un gruppo non ha voci sue:
    // paga la sua parte e basta, esattamente come un posto anonimo.
    ...names.map((alias) => ({
      alias,
      items: byAlias.get(alias) ?? [],
      placeholder: !byAlias.get(alias)?.length,
    })),
    ...Array.from({ length: Math.max(0, partySize - names.length) }, (_, k) => ({
      alias: `Persona ${names.length + k + 1}`,
      items: [] as BillLine[],
      placeholder: true,
    })),
  ];

  const postoDi = new Map(posti.map((p, i) => [p.alias, i]));

  // Ogni gruppo si divide tra i suoi: "Condiviso" tra tutti i posti, un gruppo
  // di nomi solo tra quei nomi. E' l'unica differenza tra i due, e sta tutta
  // qui dentro.
  const quoteDi: BillShare[][] = posti.map(() => []);
  const shared: BillSharedGroup[] = [];

  for (const alias of aliasGruppi) {
    const items = byAlias.get(alias)!;
    const total = totaleVoci(items);
    const destinatari =
      alias === ALIAS_CONDIVISO
        ? posti.map((_, i) => i)
        : membriDi(alias)
            .map((m) => postoDi.get(m))
            .filter((i): i is number => i !== undefined);

    shared.push({ alias, teste: destinatari.length, items, total });
    if (!destinatari.length) continue;

    const quote = splitCents(total, destinatari.length);
    destinatari.forEach((posto, k) => {
      if (quote[k] > 0) {
        quoteDi[posto].push({
          alias,
          label: etichettaQuota(alias, posti[posto].alias),
          amountCents: quote[k],
        });
      }
    });
  }

  const people: BillPerson[] = posti.map((posto, i) => {
    const items = posto.items;
    const daSaldare = daPagare(items);
    const itemsTotal = totaleVoci(items);
    const shares = quoteDi[i];
    const sharedQuota = shares.reduce((s, q) => s + q.amountCents, 0);
    // La consegna la paga chi ritira, cioe' l'unico intestatario che un conto
    // fuori dalla sala ha. Lasciarla fuori da ogni persona vorrebbe dire che
    // incassando tutti resterebbe comunque un residuo che nessuno deve.
    const consegnaSuDiLui = i === 0 ? deliveryFeeCents : 0;
    // Quota e coperto vanno registrati a parte perche' si incassano da soli,
    // persona per persona. La consegna no: si paga insieme all'ordine, in un
    // gesto, quindi pretenderne una registrazione lascerebbe il conto aperto
    // per sempre.
    const daRegistrare = sharedQuota + coverChargeCents;
    const extras = daRegistrare + consegnaSuDiLui;
    // Una voce annullata non tiene aperto il conto di nessuno, ma nemmeno lo
    // chiude: chi resta con tutto annullato e zero da pagare non ha "pagato".
    const paid =
      daSaldare.every((x) => x.paid) &&
      (daRegistrare === 0 || settled.has(posto.alias)) &&
      (daSaldare.length > 0 || extras > 0);

    // Chi ha gia' pagato vale l'importo che ha versato: se dopo si corregge il
    // numero di persone, la sua quota non cambia retroattivamente.
    const incassatoDaLui = settled.get(posto.alias);
    const total =
      paid && incassatoDaLui !== undefined
        ? incassatoDaLui
        : itemsTotal + extras;

    return {
      alias: posto.alias,
      items,
      itemsTotal,
      shares,
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

  // La consegna e' gia' dentro al totale di chi ritira: sommarla di nuovo qui
  // la conterebbe due volte.
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
    key: input.key,
    channel: input.channel,
    label: input.label,
    tableNumber,
    orderId: input.orderId ?? null,
    customerName: input.customerName ?? null,
    customerPhone: input.customerPhone ?? null,
    customerAddress: input.customerAddress ?? null,
    deliveryFeeCents,
    partySize,
    people,
    shared,
    coverChargeCents,
    total,
    incassato,
    hasPending,
  };
}
