"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { reportClientError } from "@/lib/reportClientError";

// Error boundary de Next.js App Router para rutas normales (todo lo que
// cuelga de app/ salvo que tenga su propio error.tsx más específico) —
// distinto de global-error.tsx, que solo entra en juego si el error ocurre
// en el propio root layout. Este SÍ se renderiza dentro del root layout, así
// que puede reusar las clases de globals.css sin problema.
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Best-effort: si el registro en sí falla, reportClientError -> logError
    // ya se traga ese error internamente, no hay nada que atrapar acá.
    void reportClientError(error.message, error.stack, { digest: error.digest });
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="page-title">Algo salió mal</h1>
      <p className="text-sm text-ink/60">
        Ocurrió un error inesperado en esta página. Ya quedó registrado — podés intentar de nuevo.
      </p>
      <button onClick={() => reset()} className="btn-primary">
        <RotateCcw className="h-4 w-4" />
        Reintentar
      </button>
    </div>
  );
}
