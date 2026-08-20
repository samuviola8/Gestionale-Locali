import { mkdir, readdir, rename, unlink, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenantFiles } from "@/lib/db/schema";

// I documenti che carico per un locale: contratto firmato, preventivo, visura.
//
// Non passano da lib/uploads.ts e non finiscono sotto public/ apposta. Quello
// serve alle foto del menu, che devono essere pubbliche; un contratto con
// dentro partita IVA e firma del titolare non deve essere scaricabile da
// chiunque indovini l'indirizzo. Qui i file stanno in una cartella fuori dal
// servito, e ci si arriva solo dalla rotta che controlla chi sta chiedendo.

export type FileLocale = typeof tenantFiles.$inferSelect;

export const TIPI_FILE: { key: string; label: string }[] = [
  { key: "contratto", label: "Contratto" },
  { key: "preventivo", label: "Preventivo" },
  { key: "documento", label: "Documento" },
  { key: "altro", label: "Altro" },
];

export function etichettaTipoFile(k: string): string {
  return TIPI_FILE.find((t) => t.key === k)?.label ?? k;
}

// Quello che ha senso ricevere: documenti e scansioni. Niente eseguibili,
// niente archivi — non perche' siano pericolosi da fermi, ma perche' non c'e'
// nessun motivo per cui un contratto sia uno zip.
const ESTENSIONI: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
};

export const MAX_BYTES = 15 * 1024 * 1024;

export function tipoAmmesso(mime: string): boolean {
  return mime in ESTENSIONI;
}

// Lo slug finisce dentro un percorso su disco: ridotto ai caratteri di uno
// slug, un "../.." non puo' portare la scrittura fuori dall'archivio.
function cartellaLocale(slug: string): string {
  return slug.toLowerCase().replace(/[^a-z0-9-]/g, "") || "senza-locale";
}

function radice(): string {
  return path.join(process.cwd(), "archivio");
}

export function percorsoFile(slugLocale: string, storedName: string): string {
  // `storedName` lo generiamo noi ed e' esadecimale, ma il basename lo
  // rimettiamo comunque: un nome che arriva da database non e' un nome che ho
  // appena scritto io.
  return path.join(radice(), cartellaLocale(slugLocale), path.basename(storedName));
}

// I file stanno in una cartella intestata allo slug, e lo slug si puo'
// correggere: senza questo spostamento i contratti gia' caricati resterebbero
// nella cartella di prima, cercati dove non sono piu'.
export async function spostaArchivio(
  vecchioSlug: string,
  nuovoSlug: string
): Promise<void> {
  const da = path.join(radice(), cartellaLocale(vecchioSlug));
  const a = path.join(radice(), cartellaLocale(nuovoSlug));
  if (da === a) return;
  // Niente cartella da spostare: il locale non ha mai caricato niente.
  if (!existsSync(da)) return;
  // Cartella di destinazione gia' presente (uno slug ripreso da un locale
  // cancellato): si versano dentro i file invece di sovrascriverla.
  if (existsSync(a)) {
    for (const nome of await readdir(da)) {
      await rename(path.join(da, nome), path.join(a, nome));
    }
    return;
  }
  await rename(da, a);
}

export type EsitoCaricamento =
  | { ok: true; id: string }
  | { ok: false; errore: string };

export async function caricaFile(dati: {
  tenantId: string;
  slugLocale: string;
  file: FormDataEntryValue | null;
  kind: string;
  title: string;
  visibleToTenant: boolean;
  notes?: string | null;
}): Promise<EsitoCaricamento> {
  const { file } = dati;
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, errore: "Nessun file scelto." };
  }
  if (!tipoAmmesso(file.type)) {
    return { ok: false, errore: "Si caricano PDF, immagini e documenti Word." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, errore: "Il file supera i 15 MB." };
  }

  const cartella = cartellaLocale(dati.slugLocale);
  const dir = path.join(radice(), cartella);
  await mkdir(dir, { recursive: true });

  const storedName = randomBytes(16).toString("hex") + ESTENSIONI[file.type];
  await writeFile(path.join(dir, storedName), Buffer.from(await file.arrayBuffer()));

  const [riga] = await db
    .insert(tenantFiles)
    .values({
      tenantId: dati.tenantId,
      kind: TIPI_FILE.some((t) => t.key === dati.kind) ? dati.kind : "documento",
      // Senza titolo vale il nome del file: meglio "scan_0012.pdf" che una
      // riga vuota nell'elenco.
      title: dati.title.trim() || file.name,
      fileName: file.name,
      storedName,
      mimeType: file.type,
      sizeBytes: file.size,
      visibleToTenant: dati.visibleToTenant,
      notes: dati.notes?.trim() || null,
    })
    .returning({ id: tenantFiles.id });

  return { ok: true, id: riga.id };
}

export async function fileDelLocale(
  tenantId: string,
  soloVisibili = false
): Promise<FileLocale[]> {
  const righe = await db
    .select()
    .from(tenantFiles)
    .where(eq(tenantFiles.tenantId, tenantId))
    .orderBy(desc(tenantFiles.uploadedAt));
  return soloVisibili ? righe.filter((r) => r.visibleToTenant) : righe;
}

export async function getFile(id: string): Promise<FileLocale | null> {
  const righe = await db
    .select()
    .from(tenantFiles)
    .where(eq(tenantFiles.id, id))
    .limit(1);
  return righe[0] ?? null;
}

// Cancella la riga e il file. Se il file non c'e' piu' sul disco la riga se ne
// va lo stesso: una voce che punta al nulla e' peggio di niente.
export async function eliminaFile(id: string, slugLocale: string): Promise<void> {
  const file = await getFile(id);
  if (!file) return;
  try {
    await unlink(percorsoFile(slugLocale, file.storedName));
  } catch {
    // gia' sparito
  }
  await db.delete(tenantFiles).where(eq(tenantFiles.id, id));
}

export function pesoLeggibile(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
