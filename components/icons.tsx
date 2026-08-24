import type { ReactNode } from "react";

type Props = { size?: number; className?: string };

function Base({
  size = 18,
  className,
  children,
}: Props & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconHome(p: Props) {
  return (
    <Base {...p}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </Base>
  );
}

export function IconOrders(p: Props) {
  return (
    <Base {...p}>
      <line x1="9" y1="6" x2="20" y2="6" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <line x1="9" y1="18" x2="20" y2="18" />
      <circle cx="4.5" cy="6" r="1" fill="currentColor" />
      <circle cx="4.5" cy="12" r="1" fill="currentColor" />
      <circle cx="4.5" cy="18" r="1" fill="currentColor" />
    </Base>
  );
}

export function IconSettings(p: Props) {
  return (
    <Base {...p}>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="17" x2="20" y2="17" />
      <circle cx="10" cy="7" r="2.5" fill="var(--surface)" />
      <circle cx="16" cy="17" r="2.5" fill="var(--surface)" />
    </Base>
  );
}

// Cassa al banco: il bancone visto di lato.
export function IconCounter(p: Props) {
  return (
    <Base {...p}>
      <path d="M3 10h18l-1.5 10.5a1 1 0 0 1-1 .5H5.5a1 1 0 0 1-1-.5Z" />
      <path d="M7 10V6a5 5 0 0 1 10 0v4" />
    </Base>
  );
}

export function IconChart(p: Props) {
  return (
    <Base {...p}>
      <line x1="4" y1="20" x2="20" y2="20" />
      <rect x="6" y="12" width="3.5" height="6" rx="1" />
      <rect x="12" y="7" width="3.5" height="11" rx="1" />
      <rect x="17.5" y="14" width="3" height="4" rx="1" />
    </Base>
  );
}

// Ordine preso a voce: uno scontrino con il piu'.
export function IconPlus(p: Props) {
  return (
    <Base {...p}>
      <line x1="9" y1="7" x2="19" y2="7" />
      <line x1="9" y1="12" x2="19" y2="12" />
      <line x1="9" y1="17" x2="14" y2="17" />
      <line x1="4.5" y1="17" x2="4.5" y2="7" />
    </Base>
  );
}

export function IconBill(p: Props) {
  return (
    <Base {...p}>
      <path d="M6 3h12v18l-3-1.5L12 21l-3-1.5L6 21z" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="9" y1="12" x2="15" y2="12" />
    </Base>
  );
}

export function IconMenu(p: Props) {
  return (
    <Base {...p}>
      <path d="M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="9" y1="12" x2="13" y2="12" />
    </Base>
  );
}

export function IconQr(p: Props) {
  return (
    <Base {...p}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="3" height="3" />
      <rect x="18" y="18" width="3" height="3" />
    </Base>
  );
}

// Sala: la pianta dei tavoli, due tondi dentro le quattro pareti.
export function IconSala(p: Props) {
  return (
    <Base {...p}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="9" cy="9.5" r="2.2" />
      <circle cx="15.5" cy="15" r="2.2" />
    </Base>
  );
}

// Prenotazioni: il calendario con il giorno segnato.
export function IconCalendar(p: Props) {
  return (
    <Base {...p}>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="3" x2="8" y2="7" />
      <line x1="16" y1="3" x2="16" y2="7" />
      <rect x="7" y="13" width="4" height="4" rx="1" fill="currentColor" />
    </Base>
  );
}

export function IconLogout(p: Props) {
  return (
    <Base {...p}>
      <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </Base>
  );
}

export function IconBell(p: Props) {
  return (
    <Base {...p}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </Base>
  );
}

export function IconRubrica(p: Props) {
  return (
    <Base {...p}>
      <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v18H5.5A1.5 1.5 0 0 1 4 19.5z" />
      <path d="M2 8h2" />
      <path d="M2 12h2" />
      <path d="M2 16h2" />
      <circle cx="12" cy="10" r="2.2" />
      <path d="M8.7 16a3.6 3.6 0 0 1 6.6 0" />
    </Base>
  );
}

export function IconUsers(p: Props) {
  return (
    <Base {...p}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Base>
  );
}

export function IconSegnalazione(p: Props) {
  return (
    <Base {...p}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <line x1="12" y1="7.5" x2="12" y2="11.5" />
      <path d="M12 14.2h.01" />
    </Base>
  );
}

export function IconBurger(p: Props) {
  return (
    <Base {...p}>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </Base>
  );
}

export function IconClose(p: Props) {
  return (
    <Base {...p}>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </Base>
  );
}

export function IconFattura(p: Props) {
  return (
    <Base {...p}>
      <path d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21z" />
      <line x1="9" y1="9" x2="15" y2="9" />
      <line x1="9" y1="13" x2="13" y2="13" />
    </Base>
  );
}

export function IconAiuto(p: Props) {
  return (
    <Base {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.6 2.6 0 0 1 5 1c0 1.7-2.5 2-2.5 3.5" />
      <path d="M12 17.2h.01" />
    </Base>
  );
}

export function IconStella(p: Props) {
  return (
    <Base {...p}>
      <path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9z" />
    </Base>
  );
}
