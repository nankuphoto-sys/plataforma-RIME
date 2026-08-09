// Tarjeta de servicio con nombre + duración + precio + acción de reservar,
// tal como la describe el spec de rediseño (sección 2.2) — antes vivía como
// JSX repetido inline en el paso "service" de BookingWizard.tsx.
interface ServiceCardProps {
  name: string;
  durationMinutes: number;
  price: string;
  onClick: () => void;
}

export function ServiceCard({ name, durationMinutes, price, onClick }: ServiceCardProps) {
  return (
    <button type="button" onClick={onClick} className="booking-option">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-ink">{name}</span>
        <span className="data-mono flex-none text-sm text-ink/50">{durationMinutes} min</span>
      </div>
      <span className="data-mono mt-1 block text-sm font-medium text-pine-dark">
        ${Number(price).toLocaleString("es-CO")}
      </span>
    </button>
  );
}
