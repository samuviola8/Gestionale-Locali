// Campo con etichetta sempre visibile.
//
// Il placeholder da solo non basta: sparisce appena si scrive, e chi torna sul
// modulo a meta' compilazione non sa piu' cosa stava inserendo.
export default function Field({
  label,
  hint,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={"block " + className}>
      <span
        className="mb-1 block text-xs font-medium"
        style={{ color: "var(--muted)" }}
      >
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-xs" style={{ color: "var(--muted)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}
