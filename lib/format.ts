// Formattazioni pure, usabili anche dai componenti client: sta a parte da
// lib/menu.ts perche' quello importa il database.

// 700 -> "€7,00"
export function formatPrice(cents: number): string {
  return "€" + (cents / 100).toFixed(2).replace(".", ",");
}
