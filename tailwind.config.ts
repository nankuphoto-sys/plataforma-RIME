import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta "cronógrafo" — reemplaza a la pine/sage/gold cálida
        // original. Los NOMBRES de los tokens se mantienen igual a
        // propósito (pine, sage, berry, gold, ink, paper) para que todo
        // el código existente que ya usa bg-pine/text-ink/border-sage-dark
        // en toda la app (dashboard, reserva pública, tickets, auth)
        // herede el nuevo look sin tener que tocar cada archivo — ver
        // CLAUDE.md para el detalle de la exploración de identidad.
        ink: "#262119",
        paper: "#F4EEE0",
        // Antes verde pino; ahora latón — sigue siendo el color de acción
        // primaria (botones, focus ring, links) en toda la app.
        pine: {
          DEFAULT: "#B08D57",
          dark: "#8C6E3F",
          light: "#C8A876",
        },
        // Neutro cálido para bordes/fondos sutiles (antes verde salvia).
        sage: {
          DEFAULT: "#EFE8D8",
          dark: "#D9CDB0",
        },
        // Rojo cronógrafo — reservado para alertas/errores, igual que antes.
        berry: {
          DEFAULT: "#C23B2E",
          dark: "#8F2A20",
        },
        // Oro cálido, distinto del latón — para badges/acentos "pendiente".
        gold: {
          DEFAULT: "#D4AF6A",
        },
        // Nuevo: la "caja" oscura del sidebar (riel de íconos) — no existía
        // un tono oscuro propio antes porque el sidebar usaba bg-pine.
        case: {
          DEFAULT: "#2A2622",
          deep: "#1E1B18",
        },
      },
      fontFamily: {
        // "cronógrafo": display apunta a --font-sans (Plus Jakarta Sans en
        // peso alto), no a una serif separada — ver src/app/layout.tsx.
        display: ["var(--font-sans)"],
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        xl: "0.875rem",
      },
    },
  },
  plugins: [],
};

export default config;
