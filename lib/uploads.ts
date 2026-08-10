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

export async function saveImage(
  file: FormDataEntryValue | null
): Promise<string | null> {
  if (!(file instanceof File) || file.size === 0) return null;
  const ext = EXT[file.type];
  if (!ext) return null;
  if (file.size > MAX_BYTES) return null;

  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  const name = randomBytes(8).toString("hex") + ext;
  await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
  return "/uploads/" + name;
}
