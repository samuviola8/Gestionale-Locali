import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

// Salvataggio immagini (foto prodotto, logo del locale).
// NOTA: scrive su disco locale sotto public/uploads. Va sostituito con uno
// storage esterno prima di un deploy serverless o multi-istanza.

const EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
};

const MAX_BYTES = 5 * 1024 * 1024;

// Lo slug finisce dentro un percorso su disco, e in creazione locale arriva
// da un campo del modulo: ridotto ai caratteri di uno slug, un "../.." non
// puo' portare la scrittura fuori da public/uploads.
function cartellaLocale(slug: string): string {
  return slug.toLowerCase().replace(/[^a-z0-9-]/g, "") || "senza-locale";
}

// Ogni locale scrive nella propria cartella. Cosi' un menu espone soltanto i
// propri indirizzi - da "Ispeziona" non si vedono quelli degli altri - e
// quando un cliente se ne va la sua roba si cancella in un colpo solo.
export async function saveImage(
  file: FormDataEntryValue | null,
  slugLocale: string
): Promise<string | null> {
  if (!(file instanceof File) || file.size === 0) return null;
  const ext = EXT[file.type];
  if (!ext) return null;
  if (file.size > MAX_BYTES) return null;

  const cartella = cartellaLocale(slugLocale);
  const dir = path.join(process.cwd(), "public", "uploads", cartella);
  await mkdir(dir, { recursive: true });
  const name = randomBytes(8).toString("hex") + ext;
  await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
  return `/uploads/${cartella}/${name}`;
}
