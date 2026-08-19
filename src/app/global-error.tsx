"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/reportClientError";

// Error boundary raíz de Next.js App Router: solo entra en juego si el error
// ocurre en el propio root layout (src/app/layout.tsx) o por encima de
// cualquier otro error.tsx. A diferencia de error.tsx, este REEMPLAZA el
// root layout entero (Next.js exige que defina su propio <html>/<body>), así
// que no hay garantía de que globals.css esté disponible acá — por eso usa
// estilos inline en vez de las clases de Tailwind del resto de la app.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void reportClientError(error.message, error.stack, { digest: error.digest });
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "1.5rem",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          color: "#1f2a24",
          backgroundColor: "#faf7f2",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>Algo salió mal</h1>
        <p style={{ maxWidth: "28rem", fontSize: "0.875rem", opacity: 0.7 }}>
          Ocurrió un error inesperado. Ya quedó registrado — podés intentar de nuevo o volver más tarde.
        </p>
        <button
          onClick={() => reset()}
          style={{
            borderRadius: "0.5rem",
            backgroundColor: "#2f5945",
            color: "#faf7f2",
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
            fontWeight: 500,
            border: "none",
            cursor: "pointer",
          }}
        >
          Reintentar
        </button>
      </body>
    </html>
  );
}
