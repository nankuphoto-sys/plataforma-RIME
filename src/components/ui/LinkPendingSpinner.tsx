"use client";

import { useLinkStatus } from "next/link";
import { Loader2 } from "lucide-react";

// Debe renderizarse como hijo de un <Link>: refleja el estado de pending de
// ESE link puntual (Next.js 15, useLinkStatus) para dar feedback instantáneo
// en navegaciones que tardan (ej. la carga de datos de la página destino).
export function LinkPendingSpinner({ className = "h-3.5 w-3.5" }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <Loader2 className={`${className} animate-spin`} />;
}
