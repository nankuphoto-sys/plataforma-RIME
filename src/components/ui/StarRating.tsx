"use client";

import { Star } from "lucide-react";

interface StarRatingProps {
  value: number;
  onChange?: (next: number) => void;
  size?: "sm" | "md";
}

const SIZE_CLASS: Record<"sm" | "md", string> = {
  sm: "h-3.5 w-3.5",
  md: "h-5 w-5",
};

// Sin onChange: estrellas fijas (promedio público, listado del dashboard).
// Con onChange: botones clickeables (input del formulario de reseña en
// /resena) — mismo componente para no duplicar el layout de 5 íconos.
export function StarRating({ value, onChange, size = "md" }: StarRatingProps) {
  const starClass = SIZE_CLASS[size];
  const stars = [1, 2, 3, 4, 5];

  if (!onChange) {
    return (
      <span className="inline-flex items-center gap-0.5" aria-label={`${value} de 5 estrellas`}>
        {stars.map((n) => (
          <Star
            key={n}
            className={`${starClass} ${n <= Math.round(value) ? "fill-gold text-gold" : "fill-transparent text-sage-dark"}`}
            strokeWidth={1.5}
          />
        ))}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-0.5">
      {stars.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`${n} de 5 estrellas`}
          aria-pressed={n === value}
          className="p-0.5"
        >
          <Star
            className={`${starClass} transition-colors ${n <= value ? "fill-gold text-gold" : "fill-transparent text-sage-dark hover:text-gold"}`}
            strokeWidth={1.5}
          />
        </button>
      ))}
    </span>
  );
}
