import type { Skin } from "./types";
import { baseSkin } from "./base";
import { noyaSkin } from "./noya";

// Registry delle skin. Statico di proposito: un import dinamico per chiave
// impedirebbe al bundler di vedere quali file servono davvero.
//
// Nuovo locale con look su misura = un file qui accanto e una riga in questa
// lista. La logica di ordine e carrello non si tocca.
export const SKINS: Skin[] = [baseSkin, noyaSkin];

export const DEFAULT_SKIN_KEY = "base";

export function getSkin(key: string | null | undefined): Skin {
  return (
    SKINS.find((s) => s.key === key) ??
    SKINS.find((s) => s.key === DEFAULT_SKIN_KEY)!
  );
}

export type { Skin } from "./types";
