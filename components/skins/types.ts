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
};
