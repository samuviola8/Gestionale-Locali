// Contratto delle skin del menu.
//
// Una skin decide SOLO come si presenta la pagina cliente: markup, classi,
// animazioni, accenti. Non conosce il carrello, non parla col server, non
// decide i prezzi. Tutta quella logica sta in OrderClient ed e' identica per
// ogni locale: cambiando skin cambia l'aspetto, mai il comportamento.
//
// Aggiungere un locale con un look su misura = un file in questa cartella
// piu' una riga nel registry.

export type SkinVariant = {
  id: string;
  name: string;
  priceCents: number;
  available: boolean;
};

export type SkinProduct = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  ingredients: string[];
  allergens: string[];
  priceCents: number;
  available: boolean;
  variants: SkinVariant[];
  // Prodotto "su richiesta": il cliente scrive cosa desidera.
  acceptsNote: boolean;
  // Si serve in bottiglia: prima di ordinarlo si chiede quanti calici portare.
  requiresGlasses: boolean;
};

export type SkinCategory = {
  id: string;
  name: string;
  products: SkinProduct[];
};

export type HeroProps = {
  tenantName: string;
  logoUrl: string | null;
  tableNumber: number;
};

export type CategoryNavProps = {
  categories: SkinCategory[];
  // Categoria attualmente sotto l'occhio dell'utente (scroll-spy).
  activeId: string | null;
  onSelect: (categoryId: string) => void;
};

export type CategorySectionProps = {
  category: SkinCategory;
  // Indice della categoria: le skin lo usano per variare l'accento cromatico.
  index: number;
  children: React.ReactNode;
};

export type ProductCardProps = {
  product: SkinProduct;
  index: number;
  categoryIndex: number;
  // Etichetta gia' formattata ("€12,00" oppure "da €5,00").
  priceLabel: string;
  onAdd: () => void;
  // Apre il dettaglio. La card resta la riga corta da scorrere: quello che non
  // ci sta (foto grande, ingredienti, allergeni per esteso) sta li' dentro.
  onOpen: () => void;
};

// Il dettaglio di un prodotto. La skin disegna solo il pannello: sfondo,
// chiusura al tocco fuori, Escape e tasto indietro li mette OrderClient, come
// per tutti gli altri fogli.
export type ProductSheetProps = {
  product: SkinProduct;
  // Indice della categoria a cui appartiene: serve alle skin che colorano per
  // sezione, cosi' il foglio resta in tinta con la card da cui si e' aperto.
  categoryIndex: number;
  priceLabel: string;
  // Senza variante sui prodotti a prezzo unico. Chiude il foglio da solo.
  onAdd: (variant?: SkinVariant) => void;
  onClose: () => void;
};

export type Skin = {
  key: string;
  label: string;
  description: string;
  // CSS della skin, iniettato una volta sola nella pagina cliente.
  css?: string;
  // Classe applicata al contenitore del menu.
  rootClassName?: string;
  Hero: (props: HeroProps) => React.ReactElement;
  CategoryNav: (props: CategoryNavProps) => React.ReactElement;
  CategorySection: (props: CategorySectionProps) => React.ReactElement;
  ProductCard: (props: ProductCardProps) => React.ReactElement;
  // Facoltativo: chi non lo disegna eredita il dettaglio della skin base.
  ProductSheet?: (props: ProductSheetProps) => React.ReactElement;
};
