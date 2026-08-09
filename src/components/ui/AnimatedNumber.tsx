"use client";

import { useEffect, useRef, useState } from "react";

interface AnimatedNumberProps {
  value: number;
  durationMs?: number;
  // Cantidad de decimales a mostrar (0 = entero con separador de miles,
  // 2 = money con centavos). A propósito NO es una función: este
  // componente se usa desde Server Components (ej. reports/page.tsx), y
  // una función pasada como prop de Server a Client Component revienta en
  // runtime ("Functions cannot be passed directly to Client Components") —
  // un número sí es serializable a través de ese límite.
  decimals?: number;
  className?: string;
}

const DEFAULT_DURATION_MS = 700;

function formatValue(value: number, decimals: number): string {
  return decimals > 0
    ? value.toFixed(decimals)
    : Math.round(value).toLocaleString("es-CO");
}

// Cuenta de 0 (o del último valor mostrado) hasta `value` con
// requestAnimationFrame — sin librería, un solo lugar para no repetir esta
// animación copiada y pegada en cada página que muestre un total. Respeta
// prefers-reduced-motion vía matchMedia (el kill-switch CSS de globals.css
// no alcanza acá porque esto interpola un valor de estado en JS, no una
// propiedad CSS con transition).
export function AnimatedNumber({
  value,
  durationMs = DEFAULT_DURATION_MS,
  decimals = 0,
  className,
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const previousValueRef = useRef(0);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      setDisplayValue(value);
      previousValueRef.current = value;
      return;
    }

    const startValue = previousValueRef.current;
    const startTime = performance.now();
    let frameId: number;

    function tick(now: number) {
      const progress = Math.min((now - startTime) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cúbico
      setDisplayValue(startValue + (value - startValue) * eased);

      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      } else {
        previousValueRef.current = value;
      }
    }

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [value, durationMs]);

  return <span className={className}>{formatValue(displayValue, decimals)}</span>;
}
