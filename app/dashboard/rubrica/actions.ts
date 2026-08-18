"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { hasModule } from "@/lib/modules";
import {
  eliminaCliente,
  importaRubrica,
  scriviCliente,
  type EsitoImport,
} from "@/lib/rubrica";

// Chi puo' toccare la rubrica: lo staff del locale, e solo col modulo acceso.
// Il controllo si rifa' qui e non solo sulla pagina, perche' una server action
// e' un indirizzo raggiungibile per conto suo.
async function permesso(): Promise<string | null> {
  const s = await getSessionUser();
  if (!s) return null;
  if (!(await hasModule(s.tenantId, "customers"))) return null;
  return s.tenantId;
}

function campo(f: FormData, nome: string): string {
  return String(f.get(nome) ?? "");
}

export type EsitoScheda = { ok?: boolean; errore?: string };

// Scheda nuova o corretta. Torna un esito invece di reindirizzare: chi sta
// correggendo un indirizzo deve restare dov'e', con l'errore sotto il campo.
export async function salvaScheda(
  _prev: EsitoScheda,
  formData: FormData
): Promise<EsitoScheda> {
  const tenantId = await permesso();
  if (!tenantId) return { errore: "Non hai accesso alla rubrica." };

  const id = campo(formData, "id").trim() || null;
  const esito = await scriviCliente(tenantId, id, {
    nome: campo(formData, "nome"),
    telefono: campo(formData, "telefono"),
    email: campo(formData, "email"),
    via: campo(formData, "via"),
    civico: campo(formData, "civico"),
    dettaglio: [campo(formData, "cap"), campo(formData, "citta")]
      .map((v) => v.trim())
      .filter(Boolean)
      .join(" "),
    note: campo(formData, "note"),
  });
  if (!esito.ok) return { errore: esito.errore };

  revalidatePath("/dashboard/rubrica");
  return { ok: true };
}

export async function cancellaScheda(formData: FormData): Promise<void> {
  const tenantId = await permesso();
  if (!tenantId) return;
  const id = campo(formData, "id").trim();
  if (!id) return;
  await eliminaCliente(tenantId, id);
  revalidatePath("/dashboard/rubrica");
}

// Due megabyte: una rubrica da migliaia di clienti ci sta abbondantemente, e
// oltre non e' piu' un'agenda, e' l'export di un gestionale intero.
const MAX_FILE = 2 * 1024 * 1024;

export type EsitoImportUI = EsitoImport & { fatto?: boolean };

export async function importaSchede(
  _prev: EsitoImportUI,
  formData: FormData
): Promise<EsitoImportUI> {
  const vuoto = { aggiunti: 0, aggiornati: 0, saltati: 0 };
  const tenantId = await permesso();
  if (!tenantId) return { ...vuoto, errore: "Non hai accesso alla rubrica." };

  const file = formData.get("file");
  let testo = campo(formData, "testo");

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_FILE) {
      return { ...vuoto, errore: "Il file è troppo grande (oltre 2 MB)." };
    }
    testo = await file.text();
  }
  if (!testo.trim()) {
    return { ...vuoto, errore: "Scegli un file o incolla le righe." };
  }

  const esito = await importaRubrica(tenantId, testo);
  revalidatePath("/dashboard/rubrica");
  return { ...esito, fatto: !esito.errore };
}
