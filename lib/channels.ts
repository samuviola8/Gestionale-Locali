import type { ModuleKey } from "@/lib/modules";

// Da dove arriva un ordine. La sala e' il caso storico; gli altri tre esistono
// perche' un conto puo' benissimo non avere un tavolo sotto.

export type Channel = "tavolo" | "banco" | "asporto" | "domicilio";

export type ChannelDef = {
  key: Channel;
  label: string;
  // Come si chiama un singolo ordine di questo canale nella coda e sul conto.
  singolare: string;
  // Il modulo che lo accende. La sala non ne ha uno proprio: c'e' sempre.
  module: ModuleKey | null;
  // Fuori dalla sala non ci si siede: niente coperto, niente conto diviso, e
  // il conto vive sull'ordine invece che sul tavolo.
  seduti: boolean;
  chiedeNome: boolean;
  chiedeIndirizzo: boolean;
  // Minuti oltre i quali l'attesa e' anomala. Un domicilio a venti minuti e'
  // normale, un tavolo a venti minuti e' un disastro: con una soglia sola il
  // colore della coda mentirebbe su uno dei due.
  attesaWarn: number;
  attesaDanger: number;
};

export const CHANNELS: ChannelDef[] = [
  {
    key: "tavolo",
    label: "Sala",
    singolare: "Tavolo",
    module: null,
    seduti: true,
    chiedeNome: false,
    chiedeIndirizzo: false,
    attesaWarn: 5,
    attesaDanger: 12,
  },
  {
    key: "banco",
    label: "Banco",
    singolare: "Banco",
    module: "counter_orders",
    seduti: false,
    chiedeNome: false,
    chiedeIndirizzo: false,
    attesaWarn: 3,
    attesaDanger: 8,
  },
  {
    key: "asporto",
    label: "Asporto",
    singolare: "Asporto",
    module: "takeaway",
    seduti: false,
    chiedeNome: true,
    chiedeIndirizzo: false,
    attesaWarn: 15,
    attesaDanger: 30,
  },
  {
    key: "domicilio",
    label: "Domicilio",
    singolare: "Domicilio",
    module: "delivery",
    seduti: false,
    chiedeNome: true,
    chiedeIndirizzo: true,
    attesaWarn: 25,
    attesaDanger: 45,
  },
];

export function isChannel(v: string): v is Channel {
  return CHANNELS.some((c) => c.key === v);
}

export function getChannel(key: string): ChannelDef {
  return CHANNELS.find((c) => c.key === key) ?? CHANNELS[0];
}
