import MenuSkeleton from "@/components/MenuSkeleton";

// Mostrato appena si clicca "Menu", prima ancora che il server risponda.
// Senza, cliccando non succedeva niente per qualche decimo di secondo e
// sembrava che il click non fosse stato preso.
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div>
        <h1 className="text-2xl font-semibold">Menu</h1>
        <div className="skeleton mt-1.5 h-3 w-56 rounded" />
      </div>

      <div className="flex gap-2 overflow-hidden">
        {[72, 104, 60, 56, 64, 84].map((w, i) => (
          <div key={i} className="skeleton h-9 shrink-0 rounded-full" style={{ width: w }} />
        ))}
      </div>

      <div className="skeleton h-28 w-full rounded-[14px]" />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="skeleton h-12 rounded-[14px]" />
        <div className="skeleton h-12 rounded-[14px]" />
      </div>

      <MenuSkeleton />
    </div>
  );
}
