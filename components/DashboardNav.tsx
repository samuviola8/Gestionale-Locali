"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ModuleKey } from "@/lib/modules";
import {
  IconHome,
  IconOrders,
  IconBill,
  IconMenu,
  IconQr,
  IconUsers,
  IconPlus,
  IconChart,
  IconCounter,
  IconCalendar,
  IconSettings,
} from "@/components/icons";

// `module` collega la voce a un modulo del catalogo: se il locale non ce l'ha
// attivo, la voce sparisce. Con piu' moduli basta averne uno — i tavoli
// servono sia al QR sia alla prenotazione. Le voci senza `module` ci sono sempre.
const items: {
  href: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  module?: ModuleKey | ModuleKey[];
}[] = [
  { href: "/dashboard", label: "Dashboard", Icon: IconHome },
  {
    href: "/dashboard/orders",
    label: "Coda ordini",
    Icon: IconOrders,
    module: "qr_ordering",
  },
  {
    href: "/dashboard/cameriere",
    label: "Ordine dal cameriere",
    Icon: IconPlus,
    module: "qr_ordering",
  },
  {
    href: "/dashboard/banco",
    label: "Cassa al banco",
    Icon: IconCounter,
    module: "counter_orders",
  },
  {
    href: "/dashboard/bill",
    label: "Conti aperti",
    Icon: IconBill,
    module: "split_bill",
  },
  {
    href: "/dashboard/prenotazioni",
    label: "Prenotazioni",
    Icon: IconCalendar,
    module: "reservations",
  },
  { href: "/dashboard/analytics", label: "Analytics", Icon: IconChart },
  { href: "/dashboard/menu", label: "Menu", Icon: IconMenu },
  {
    href: "/dashboard/tables",
    label: "Tavoli e QR",
    Icon: IconQr,
    module: ["qr_ordering", "reservations"],
  },
  { href: "/dashboard/staff", label: "Staff", Icon: IconUsers },
  { href: "/dashboard/impostazioni", label: "Impostazioni", Icon: IconSettings },
];

export default function DashboardNav({
  modules,
  soloCoda = false,
  isOwner = true,
}: {
  modules: Record<ModuleKey, boolean>;
  // Chi sta a una postazione di preparazione: la sua giornata e' la coda, e
  // conti e incassi non lo riguardano.
  soloCoda?: boolean;
  isOwner?: boolean;
}) {
  const path = usePathname();
  const visible = items
    .filter((i) =>
      !i.module
        ? true
        : Array.isArray(i.module)
          ? i.module.some((k) => modules[k])
          : modules[i.module]
    )
    .filter((i) => !soloCoda || i.href === "/dashboard/orders")
    .filter((i) => isOwner || i.href !== "/dashboard/impostazioni");

  return (
    <nav className="space-y-1">
      {visible.map(({ href, label, Icon }) => {
        // Anche le pagine figlie tengono accesa la voce: dentro "Ordine al
        // banco" per un tavolo, la barra non deve sembrare altrove.
        const active =
          path === href || (href !== "/dashboard" && path.startsWith(href + "/"));
        return (
          // Link e non <a>: naviga lato client e precarica la pagina al
          // passaggio del mouse, invece di ricaricare tutto da capo.
          <Link
            key={href}
            href={href}
            className={
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition " +
              (active
                ? "bg-[var(--brand-50)] font-medium text-[var(--brand-text)]"
                : "text-neutral-600 hover:bg-neutral-50")
            }
          >
            <Icon />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
