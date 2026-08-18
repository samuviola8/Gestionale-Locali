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

// Una skin con tutti i pezzi al loro posto: i facoltativi sono gia' riempiti
// col corrispondente della skin base, cosi' chi la usa non deve chiederselo.
type SkinCompleta = Skin & {
  ProductSheet: NonNullable<Skin["ProductSheet"]>;
};

// Riempita una volta sola all'avvio: farlo a ogni render vorrebbe dire un
// oggetto nuovo per fotogramma, e con lui il rimontaggio di tutte le card.
const COMPLETE: SkinCompleta[] = SKINS.map((s) => ({
  ...s,
  ProductSheet: s.ProductSheet ?? baseSkin.ProductSheet!,
}));

export function getSkin(key: string | null | undefined): SkinCompleta {
  return (
    COMPLETE.find((s) => s.key === key) ??
    COMPLETE.find((s) => s.key === DEFAULT_SKIN_KEY)!
  );
}

export type { Skin } from "./types";
