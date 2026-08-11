import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  message: string;
}

// Reemplaza el placeholder de solo texto (`.empty-row` suelto en un div con
// borde punteado) que se repetía sin ícono en las 10 listas rediseñadas
// como tarjetas — un solo componente para que el ícono/tono quede igual en
// todas en vez de reinventarse página por página.
export function EmptyState({ icon: Icon, message }: EmptyStateProps) {
  return (
    <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-dashed border-sage-dark/40 px-4 py-10 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sage text-ink/35">
        <Icon className="h-5 w-5" />
      </span>
      <p className="text-sm text-ink/40">{message}</p>
    </div>
  );
}
