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
} from "@/components/icons";

// `module` collega la voce a un modulo del catalogo: se il locale non ce l'ha
// attivo, la voce sparisce. Le voci senza `module` ci sono sempre.
const items: {
  href: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  module?: ModuleKey;
}[] = [
  { href: "/dashboard", label: "Dashboard", Icon: IconHome },
  {
    href: "/dashboard/orders",
    label: "Coda ordini",
    Icon: IconOrders,
    module: "qr_ordering",
  },
  {
    href: "/dashboard/ordina",
    label: "Ordine al banco",
    Icon: IconPlus,
    module: "qr_ordering",
  },
  {
    href: "/dashboard/bill",
    label: "Conti aperti",
    Icon: IconBill,
    module: "split_bill",
  },
  { href: "/dashboard/menu", label: "Menu", Icon: IconMenu },
  {
    href: "/dashboard/tables",
    label: "Tavoli e QR",
    Icon: IconQr,
    module: "qr_ordering",
  },
  { href: "/dashboard/staff", label: "Staff", Icon: IconUsers },
];

export default function DashboardNav({
  modules,
}: {
  modules: Record<ModuleKey, boolean>;
}) {
  const path = usePathname();
  const visible = items.filter((i) => !i.module || modules[i.module]);

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
