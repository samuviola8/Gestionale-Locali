import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema";
import { componiIndirizzo } from "@/lib/indirizzi";

// Rubrica dei clienti: l'agenda accanto al telefono, scritta una volta sola.
//
// Qui dentro c'e' tutto quello che serve per riconoscere chi sta ordinando —
// la normalizzazione dei recapiti, la ricerca, l'importazione da file — perche'
// il problema vero non e' salvare un nome, e' capire che il "Marco" di stasera
// e' lo stesso di martedi' scorso e non una terza scheda uguale alle altre due.

export type ClienteRubrica = {
  id: string;
  nome: string;
  telefono: string;
  email: string;
  via: string;
  civico: string;
  dettaglio: string;
  indirizzo: string;
  note: string;
  ordini: number;
  // ISO, o null per chi e' stato scritto a mano e non ha ancora ordinato.
  ultimoOrdine: string | null;
};

// I pezzi di una scheda, come arrivano dalla cassa o da un file importato.
export type DatiRubrica = {
  nome?: string;
  telefono?: string;
  email?: string;
  via?: string;
  civico?: string;
  dettaglio?: string;
  note?: string;
};

const MAX_NOME = 120;
const MAX_TEL = 32;
const MAX_TESTO = 160;
const MAX_NOTE = 300;

function taglia(v: string | undefined | null, max: number): string {
  return (v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

// Il telefono ridotto alle sole cifre, senza prefisso internazionale.
//
// La stessa persona lo detta ogni volta in un modo diverso — "+39 333 1234567",
// "3331234567", "333 12 34 567" — e confrontare le stringhe cosi' come sono
// vorrebbe dire tre schede per un cliente solo. Il "39" si toglie solo se
// avanza un numero di lunghezza plausibile: un cellulare italiano che comincia
// per 39 esiste, e non va decapitato.
export function chiaveTelefono(grezzo: string | undefined | null): string {
  const cifre = (grezzo ?? "").replace(/\D/g, "");
  if (!cifre) return "";
  const nudo = cifre.startsWith("0039")
    ? cifre.slice(4)
    : cifre.length > 10 && cifre.startsWith("39")
      ? cifre.slice(2)
      : cifre;
  // Sotto le sei cifre non e' un recapito: e' un numero battuto per sbaglio, e
  // usarlo come chiave accorperebbe clienti che non c'entrano niente.
  return nudo.length >= 6 ? nudo.slice(0, 20) : "";
}

// Un indirizzo scritto tutto di fila, rimesso nei suoi pezzi.
//
// Serve solo a chi importa da un file: alla cassa i pezzi arrivano gia'
// separati dal campo indirizzo. Il civico si cerca in fondo alla prima
// virgola, che e' dove lo scrivono tutti; "Via 4 Novembre" resta intero
// perche' li' il numero sta in mezzo e non alla fine.
export function spezzaIndirizzo(riga: string): {
  via: string;
  civico: string;
  dettaglio: string;
} {
  const pezzi = (riga ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!pezzi.length) return { via: "", civico: "", dettaglio: "" };

  const strada = pezzi[0];
  const dettaglio = pezzi.slice(1).join(", ");
  const m = strada.match(/^(.+?)[\s,]+(\d{1,4}\s*[/-]?\s*[a-z]{0,6})$/i);
  if (!m) return { via: strada, civico: "", dettaglio };
  return {
    via: m[1].trim(),
    civico: m[2].replace(/\s+/g, ""),
    dettaglio,
  };
}

// Da riga di database a scheda leggibile.
type RigaCliente = typeof customers.$inferSelect;

export function daRiga(r: RigaCliente): ClienteRubrica {
  return {
    id: r.id,
    nome: r.name,
    telefono: r.phone ?? "",
    email: r.email ?? "",
    via: r.street ?? "",
    civico: r.streetNumber ?? "",
    dettaglio: r.area ?? "",
    indirizzo: r.address ?? "",
    note: r.notes ?? "",
    ordini: r.ordersCount,
    ultimoOrdine: r.lastOrderAt ? r.lastOrderAt.toISOString() : null,
  };
}

// I campi normalizzati, pronti da scrivere. `nome` vuoto = scheda da buttare:
// senza un nome non c'e' niente da cercare in rubrica.
export function normalizza(d: DatiRubrica) {
  const via = taglia(d.via, MAX_TESTO);
  const civico = taglia(d.civico, 16);
  const dettaglio = taglia(d.dettaglio, MAX_TESTO);
  const telefono = taglia(d.telefono, MAX_TEL);
  const indirizzo = componiIndirizzo(via, civico, dettaglio);
  return {
    name: taglia(d.nome, MAX_NOME),
    phone: telefono || null,
    phoneKey: chiaveTelefono(telefono) || null,
    email: taglia(d.email, MAX_TESTO).toLowerCase() || null,
    street: via || null,
    streetNumber: civico || null,
    area: dettaglio || null,
    address: indirizzo || null,
    notes: taglia(d.note, MAX_NOTE) || null,
  };
}

// I caratteri jolly di LIKE dentro il testo cercato: chi scrive "100%" cerca
// un cliente, non tutte le schede del locale.
function perLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => "\\" + c);
}

// Chi sta ordinando, cercato per nome o per telefono.
//
// Le due cose stanno nella stessa ricerca perche' alla cassa non si sa mai
// quale delle due arriva prima: al telefono chi chiama si presenta col nome,
// ma chi ha gia' ordinato lo si ritrova piu' in fretta dal numero.
export async function cercaClienti(
  tenantId: string,
  q: string,
  limite = 8
): Promise<ClienteRubrica[]> {
  const testo = q.trim();
  // Sotto le due lettere l'elenco sarebbe mezza rubrica: non aiuta nessuno.
  if (testo.length < 2) return [];

  const cifre = testo.replace(/\D/g, "");
  const condizioni = [ilike(customers.name, `%${perLike(testo)}%`)];
  if (cifre.length >= 3) {
    condizioni.push(ilike(customers.phoneKey, `%${cifre}%`));
  }

  const righe = await db
    .select()
    .from(customers)
    .where(and(eq(customers.tenantId, tenantId), or(...condizioni)))
    // Prima chi ha ordinato di recente: e' quasi sempre lui che sta
    // richiamando, e su cinque omonimi e' l'unico ordine che fa risparmiare
    // tempo davvero.
    .orderBy(desc(customers.lastOrderAt), asc(customers.name))
    .limit(Math.min(limite, 20));

  return righe.map(daRiga);
}

export async function elencoClienti(
  tenantId: string,
  q = "",
  limite = 200
): Promise<ClienteRubrica[]> {
  const testo = q.trim();
  const cifre = testo.replace(/\D/g, "");
  const filtro = testo
    ? or(
        ilike(customers.name, `%${perLike(testo)}%`),
        ilike(customers.address, `%${perLike(testo)}%`),
        ...(cifre.length >= 3 ? [ilike(customers.phoneKey, `%${cifre}%`)] : [])
      )
    : undefined;

  const righe = await db
    .select()
    .from(customers)
    .where(and(eq(customers.tenantId, tenantId), filtro))
    .orderBy(asc(customers.name))
    .limit(limite);
  return righe.map(daRiga);
}

export async function contaClienti(tenantId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(customers)
    .where(eq(customers.tenantId, tenantId));
  return r?.n ?? 0;
}

// La scheda che corrisponde ai recapiti dati, se esiste gia'.
//
// Il telefono comanda: e' l'unico dato che identifica una persona. Senza, si
// ripiega sul nome — con tutto quello che comporta, ed e' il motivo per cui
// alla cassa il telefono conviene chiederlo sempre.
async function trovaEsistente(
  tenantId: string,
  campi: ReturnType<typeof normalizza>
): Promise<{ id: string } | null> {
  if (campi.phoneKey) {
    const [r] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(
          eq(customers.tenantId, tenantId),
          eq(customers.phoneKey, campi.phoneKey)
        )
      )
      .limit(1);
    if (r) return r;
  }
  if (!campi.name) return null;
  const [r] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(
        eq(customers.tenantId, tenantId),
        // Confronto senza maiuscole: "MARIO ROSSI" e "Mario Rossi" sono la
        // stessa persona scritta da due operatori diversi.
        sql`lower(${customers.name}) = ${campi.name.toLowerCase()}`,
        // Un nome uguale non basta se i telefoni sono due diversi: quelli sono
        // due clienti che si chiamano allo stesso modo.
        campi.phoneKey
          ? sql`${customers.phoneKey} is null`
          : sql`true`
      )
    )
    .limit(1);
  return r ?? null;
}

// Solo i campi valorizzati, a gruppi.
//
// L'indirizzo viaggia tutto insieme perche' i suoi pezzi si spiegano a vicenda:
// scrivere la via nuova tenendo il CAP vecchio vuol dire mandare il fattorino
// in una via che esiste, nel comune sbagliato.
function soloPieni(
  campi: ReturnType<typeof normalizza>
): Record<string, unknown> {
  const set: Record<string, unknown> = {};
  if (campi.name) set.name = campi.name;
  if (campi.phone) {
    set.phone = campi.phone;
    set.phoneKey = campi.phoneKey;
  }
  if (campi.email) set.email = campi.email;
  if (campi.street) {
    set.street = campi.street;
    set.streetNumber = campi.streetNumber;
    set.area = campi.area;
    set.address = campi.address;
  }
  if (campi.notes) set.notes = campi.notes;
  return set;
}

// Scrive quello che si e' saputo del cliente senza cancellare quello che si
// sapeva prima: chi stasera detta solo nome e telefono non deve perdere
// l'indirizzo dettato la settimana scorsa.
function unisci(
  campi: ReturnType<typeof normalizza>
): Record<string, unknown> {
  return { ...soloPieni(campi), updatedAt: new Date() };
}

// Il cliente di un ordine appena battuto. Torna l'id della scheda toccata, o
// null se non c'era abbastanza per farne una.
export async function salvaClienteDaOrdine(
  tenantId: string,
  dati: DatiRubrica
): Promise<string | null> {
  const campi = normalizza(dati);
  // Un ordine senza nome ne' telefono non lascia niente in rubrica: e' il caso
  // del banco, dove il cliente e' chi sta davanti alla cassa.
  if (!campi.name && !campi.phone) return null;
  // Un numero senza nome resta comunque una scheda utile, purche' abbia
  // un'etichetta sotto cui ritrovarla.
  if (!campi.name) campi.name = campi.phone!;

  const adesso = new Date();
  const esistente = await trovaEsistente(tenantId, campi);

  if (esistente) {
    await db
      .update(customers)
      .set({
        ...unisci(campi),
        ordersCount: sql`${customers.ordersCount} + 1`,
        lastOrderAt: adesso,
      })
      .where(eq(customers.id, esistente.id));
    return esistente.id;
  }

  const [creato] = await db
    .insert(customers)
    .values({
      tenantId,
      ...campi,
      ordersCount: 1,
      lastOrderAt: adesso,
    })
    // Due ordini per lo stesso numero battuti insieme da due postazioni: il
    // secondo aggiorna invece di rompersi contro il vincolo.
    .onConflictDoUpdate({
      target: [customers.tenantId, customers.phoneKey],
      set: {
        ...unisci(campi),
        ordersCount: sql`${customers.ordersCount} + 1`,
        lastOrderAt: adesso,
      },
    })
    .returning({ id: customers.id });
  return creato?.id ?? null;
}

// Scheda scritta o corretta a mano dalla rubrica. Qui i campi valgono per
// quello che sono, vuoti compresi: chi cancella l'indirizzo lo vuole cancellare.
export async function scriviCliente(
  tenantId: string,
  id: string | null,
  dati: DatiRubrica
): Promise<{ ok: boolean; errore?: string }> {
  const campi = normalizza(dati);
  if (!campi.name) return { ok: false, errore: "Serve almeno il nome." };

  if (id) {
    const doppione = campi.phoneKey
      ? await db
          .select({ id: customers.id })
          .from(customers)
          .where(
            and(
              eq(customers.tenantId, tenantId),
              eq(customers.phoneKey, campi.phoneKey)
            )
          )
          .limit(1)
      : [];
    if (doppione[0] && doppione[0].id !== id) {
      return { ok: false, errore: "Quel telefono è già di un altro cliente." };
    }
    await db
      .update(customers)
      .set({ ...campi, updatedAt: new Date() })
      .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)));
    return { ok: true };
  }

  const esistente = await trovaEsistente(tenantId, campi);
  if (esistente) {
    return { ok: false, errore: "Questo cliente è già in rubrica." };
  }
  await db.insert(customers).values({ tenantId, ...campi });
  return { ok: true };
}

export async function eliminaCliente(
  tenantId: string,
  id: string
): Promise<void> {
  await db
    .delete(customers)
    .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)));
}

// ---------------------------------------------------------------------------
// Importazione da file
// ---------------------------------------------------------------------------

// Il tetto esiste perche' un file sbagliato — l'export intero di un gestionale
// vecchio — non deve poter riempire la rubrica di un locale in un colpo solo.
export const MAX_RIGHE_IMPORT = 5000;

// Lettore CSV che regge le virgolette. Serve davvero: un indirizzo contiene
// quasi sempre una virgola, e spezzare le righe con uno `split` significa
// importare mezzo indirizzo e il CAP in un campo a caso.
export function leggiCsv(testo: string): string[][] {
  const pulito = testo.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  // Il separatore lo decide la prima riga: Excel italiano scrive col punto e
  // virgola, tutto il resto del mondo con la virgola.
  const prima = pulito.split("\n")[0] ?? "";
  const sep =
    (prima.match(/;/g) ?? []).length > (prima.match(/,/g) ?? []).length
      ? ";"
      : ",";

  const righe: string[][] = [];
  let riga: string[] = [];
  let campo = "";
  let virgolette = false;

  for (let i = 0; i < pulito.length; i++) {
    const c = pulito[i];
    if (virgolette) {
      if (c === '"') {
        if (pulito[i + 1] === '"') {
          campo += '"';
          i++;
        } else virgolette = false;
      } else campo += c;
      continue;
    }
    if (c === '"') virgolette = true;
    else if (c === sep) {
      riga.push(campo);
      campo = "";
    } else if (c === "\n") {
      riga.push(campo);
      righe.push(riga);
      riga = [];
      campo = "";
    } else campo += c;
  }
  riga.push(campo);
  righe.push(riga);

  return righe.filter((r) => r.some((c) => c.trim()));
}

// Come si puo' chiamare ogni colonna. Chi importa arriva da un foglio suo, non
// dal nostro: pretendere intestazioni esatte vuol dire farlo rinunciare.
const COLONNE: Record<string, string[]> = {
  nome: ["nome", "name", "cliente", "nominativo", "ragione sociale", "denominazione"],
  cognome: ["cognome", "surname", "last name"],
  telefono: ["telefono", "tel", "cellulare", "cell", "phone", "numero", "mobile"],
  email: ["email", "e-mail", "mail", "posta"],
  indirizzo: ["indirizzo", "address", "via", "strada", "residenza"],
  civico: ["civico", "n civico", "numero civico", "nr", "n."],
  cap: ["cap", "zip", "codice postale", "postal code"],
  citta: ["citta", "città", "comune", "city", "paese", "localita", "località"],
  note: ["note", "notes", "annotazioni", "commenti", "note consegna"],
};

function intestazione(riga: string[]): Record<string, number> | null {
  const mappa: Record<string, number> = {};
  riga.forEach((cella, i) => {
    const testa = cella.trim().toLowerCase().replace(/\s+/g, " ");
    for (const [campo, alias] of Object.entries(COLONNE)) {
      if (mappa[campo] === undefined && alias.includes(testa)) mappa[campo] = i;
    }
  });
  // Senza il nome non e' un'intestazione: e' gia' la prima riga di dati.
  return mappa.nome !== undefined || mappa.cognome !== undefined ? mappa : null;
}

export type EsitoImport = {
  aggiunti: number;
  aggiornati: number;
  saltati: number;
  errore?: string;
};

// Trasforma il testo del file in schede. Sta a parte dalla scrittura perche'
// e' l'unico pezzo che si puo' guardare senza database davanti.
export function schedeDaCsv(testo: string): DatiRubrica[] {
  const righe = leggiCsv(testo);
  if (!righe.length) return [];

  const testa = intestazione(righe[0]);
  const dati = testa ? righe.slice(1) : righe;
  // Senza intestazioni riconosciute si va per posizione, nell'ordine in cui
  // le colonne stanno in qualunque agenda: chi, che numero, dove.
  const col = testa ?? { nome: 0, telefono: 1, indirizzo: 2, note: 3 };

  const prendi = (r: string[], campo: string): string =>
    col[campo] === undefined ? "" : (r[col[campo]] ?? "").trim();

  return dati.slice(0, MAX_RIGHE_IMPORT).map((r) => {
    const nome = [prendi(r, "nome"), prendi(r, "cognome")]
      .filter(Boolean)
      .join(" ");
    const rigaIndirizzo = prendi(r, "indirizzo");
    const spezzato = spezzaIndirizzo(rigaIndirizzo);
    const civico = prendi(r, "civico") || spezzato.civico;
    // CAP e comune, se il file li tiene in colonne loro, valgono piu' di
    // quello che avanza dalla riga dell'indirizzo.
    const zona = [prendi(r, "cap"), prendi(r, "citta")].filter(Boolean).join(" ");

    return {
      nome,
      telefono: prendi(r, "telefono"),
      email: prendi(r, "email"),
      via: spezzato.via,
      civico,
      dettaglio: zona || spezzato.dettaglio,
      note: prendi(r, "note"),
    };
  });
}

// Scrive in rubrica un file intero.
//
// Le schede gia' presenti si aggiornano invece di duplicarsi: chi importa la
// seconda volta lo stesso file — perche' il primo tentativo sembrava non aver
// funzionato — non deve ritrovarsi la rubrica doppia.
export async function importaRubrica(
  tenantId: string,
  testo: string
): Promise<EsitoImport> {
  const schede = schedeDaCsv(testo);
  if (!schede.length) {
    return { aggiunti: 0, aggiornati: 0, saltati: 0, errore: "Il file è vuoto." };
  }

  // Le schede gia' in casa, lette in un colpo solo: una interrogazione per
  // riga su un file da mille clienti sarebbe mille viaggi al database.
  const esistenti = await db
    .select({
      id: customers.id,
      name: customers.name,
      phoneKey: customers.phoneKey,
    })
    .from(customers)
    .where(eq(customers.tenantId, tenantId));

  const perTelefono = new Map<string, string>();
  const perNome = new Map<string, string>();
  for (const c of esistenti) {
    if (c.phoneKey) perTelefono.set(c.phoneKey, c.id);
    else perNome.set(c.name.toLowerCase(), c.id);
  }

  let aggiunti = 0;
  let aggiornati = 0;
  let saltati = 0;
  const daInserire: (ReturnType<typeof normalizza> & { tenantId: string })[] = [];
  // Le schede nuove gia' messe in coda in questo giro, per chiave. Un file che
  // nomina due volte lo stesso cliente — succede sempre, e' un export — deve
  // produrre una scheda sola: senza questa mappa il secondo passaggio andrebbe
  // a sbattere contro il vincolo sul telefono a meta' importazione.
  const inCoda = new Map<string, number>();

  for (const scheda of schede) {
    const campi = normalizza(scheda);
    if (!campi.name) {
      saltati++;
      continue;
    }

    const chiave = campi.phoneKey
      ? `t:${campi.phoneKey}`
      : `n:${campi.name.toLowerCase()}`;
    const id = campi.phoneKey
      ? perTelefono.get(campi.phoneKey)
      : perNome.get(campi.name.toLowerCase());

    if (id) {
      await db.update(customers).set(unisci(campi)).where(eq(customers.id, id));
      aggiornati++;
      continue;
    }

    const posto = inCoda.get(chiave);
    if (posto !== undefined) {
      // Stessa persona, seconda riga: si completa quella gia' in coda invece
      // di scartarla. La riga di sotto spesso ha il campo che manca sopra.
      daInserire[posto] = { ...daInserire[posto], ...soloPieni(campi) };
      saltati++;
      continue;
    }

    inCoda.set(chiave, daInserire.length);
    daInserire.push({ tenantId, ...campi });
    aggiunti++;
  }

  // A blocchi: un solo insert da cinquemila righe supera i parametri che il
  // driver riesce a mandare in una volta.
  for (let i = 0; i < daInserire.length; i += 200) {
    await db
      .insert(customers)
      .values(daInserire.slice(i, i + 200))
      .onConflictDoNothing();
  }

  return { aggiunti, aggiornati, saltati };
}
