import type { ReactNode } from "react";

// Tarjeta grande seleccionable (sede/profesional) — sin precio ni duración,
// a diferencia de ServiceCard. Mismo lenguaje visual (.booking-option de
// globals.css) que antes vivía repetido inline en BookingWizard.tsx.
interface OptionCardProps {
  onClick: () => void;
  title: string;
  meta?: ReactNode;
}

export function OptionCard({ onClick, title, meta }: OptionCardProps) {
  return (
    <button type="button" onClick={onClick} className="booking-option">
      <span className="font-medium text-ink">{title}</span>
      {meta}
    </button>
  );
}
