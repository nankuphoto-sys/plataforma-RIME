import type { Config } from "tailwindcss";

const config: Config = {
  // src/lib incluido a propósito: helpers compartidos como avatarTone()
  // (src/lib/avatar.ts) arman nombres de clase de Tailwind como strings de
  // JS puro — sin este glob, esas clases nunca aparecen en ningún archivo
  // que Tailwind escanee y el CSS correspondiente no se genera (el
  // elemento queda con fondo transparente en vez del color esperado, un
  // bug real que encontramos así: avatares de Equipo invisibles).
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Identidad RIME — mismos NOMBRES de token de siempre (ink, paper,
        // pine, sage, berry, gold) para que todo el código que ya usa
        // bg-pine/text-ink/border-sage-dark en toda la app (dashboard,
        // reserva pública, tickets, auth) herede el look sin tocar archivo
        // por archivo. Valores calcados de RIME Escritorio.dc.html (el
        // prototipo de diseño de referencia) — ver CLAUDE.md para el detalle.
        ink: "#1E2A24",
        paper: "#F6F4EE",
        // Verde pino — color de acción primaria (botones, focus ring,
        // links) en toda la app.
        pine: {
          DEFAULT: "#2F5D50",
          dark: "#22443A",
          light: "#3E7566",
        },
        // Neutro (con sesgo verde) para bordes/fondos sutiles.
        sage: {
          DEFAULT: "#E4EBE2",
          dark: "#B7C9BB",
        },
        // Rojo — alertas/errores.
        berry: {
          DEFAULT: "#A23E4C",
          dark: "#7E2F3A",
        },
        // Ámbar — pendiente/warning.
        gold: {
          DEFAULT: "#C08A2E",
        },
        // Verde de estado ("cobrado"/confirmado positivo) — distinto de
        // pine para que un badge de estado no se confunda con la acción
        // primaria, pero dentro de la misma familia verde.
        success: "#3E8F63",
        // Caja del sidebar (riel de íconos) — verde pino oscuro, no negro:
        // es el mismo tratamiento que la barra lateral de RIME Escritorio.
        case: {
          DEFAULT: "#22443A",
          deep: "#1B372F",
        },
      },
      fontFamily: {
        // Fraunces (serif) para títulos, Plus Jakarta Sans para texto — ver
        // src/app/layout.tsx.
        display: ["var(--font-display)"],
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
