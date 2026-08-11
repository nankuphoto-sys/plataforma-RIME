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
        // Paleta "Booksy" (turquesa + Inter) — reemplaza a "cronógrafo".
        // Mismos NOMBRES de token de siempre (ink, paper, pine, sage,
        // berry, gold) para que todo el código que ya usa
        // bg-pine/text-ink/border-sage-dark en toda la app (dashboard,
        // reserva pública, tickets, auth) herede el nuevo look sin tocar
        // archivo por archivo — ver CLAUDE.md para el detalle.
        ink: "#17181A",
        paper: "#F5F6F7",
        // Turquesa-petróleo — sigue siendo el color de acción primaria
        // (botones, focus ring, links) en toda la app.
        pine: {
          DEFAULT: "#1E7F95",
          dark: "#145D6E",
          light: "#E6F3F5",
        },
        // Neutro para bordes/fondos sutiles.
        sage: {
          DEFAULT: "#EEF0F1",
          dark: "#E5E7EB",
        },
        // Rojo — alertas/errores, igual que antes.
        berry: {
          DEFAULT: "#E0455C",
          dark: "#B8394C",
        },
        // Ámbar — pendiente/warning.
        gold: {
          DEFAULT: "#F2A93B",
        },
        // Nuevo: verde de estado ("cobrado"/confirmado positivo), pedido
        // explícito del spec de Booksy — no existía como token propio
        // antes (compartía color con pine). Se agrega ahora porque las
        // próximas fases (depósito, reseñas) lo van a necesitar.
        success: "#1FA855",
        // Caja del sidebar (riel de íconos, agregado en la fase
        // cronógrafo) — se conserva la estructura, se recolorea a negro
        // casi puro: es el color real de la nav bar de Booksy Biz.
        case: {
          DEFAULT: "#24262B",
          deep: "#1F2126",
        },
      },
      fontFamily: {
        // Inter reemplaza a Plus Jakarta Sans — ver src/app/layout.tsx.
        // display apunta a la misma variable que sans (sin serif aparte).
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
