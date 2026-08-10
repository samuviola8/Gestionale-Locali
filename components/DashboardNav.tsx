"use client";

import { usePathname } from "next/navigation";
import {
  IconHome,
  IconOrders,
  IconBill,
  IconMenu,
  IconQr,
  IconUsers,
} from "@/components/icons";

const items = [
  { href: "/dashboard", label: "Dashboard", Icon: IconHome },
  { href: "/dashboard/orders", label: "Coda ordini", Icon: IconOrders },
  { href: "/dashboard/bill", label: "Conti aperti", Icon: IconBill },
  { href: "/dashboard/menu", label: "Menu", Icon: IconMenu },
  { href: "/dashboard/tables", label: "Tavoli e QR", Icon: IconQr },
  { href: "/dashboard/staff", label: "Staff", Icon: IconUsers },
];

export default function DashboardNav() {
  const path = usePathname();
  return (
    <nav className="space-y-1">
      {items.map(({ href, label, Icon }) => {
        const active = path === href;
        return (
          <a
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
          </a>
        );
      })}
    </nav>
  );
}
