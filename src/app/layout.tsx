import type { Metadata, Viewport } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";
import "./globals.css";

// Dirección "Booksy" (turquesa + Inter): Inter reemplaza a Plus Jakarta Sans
// como tipografía única de marca (--font-display apunta a la misma variable
// que --font-sans, ver tailwind.config.ts `fontFamily.display`), pedido
// explícito del spec de rediseño. El mono (IBM Plex) se mantiene igual,
// sigue siendo el protagonista de horarios/montos/datos.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["500", "600", "700", "800"],
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "RIME",
  description: "Agendamiento, CRM y pagos para negocios de salud y bienestar.",
  // Habilita "Agregar a pantalla de inicio" / instalación como PWA — el
  // contenido real vive en public/manifest.json (nombre, ícono, modo
  // standalone). themeColor NO va acá: Next.js 15 lo movió al export
  // `viewport` de abajo (ponerlo en metadata tira warning de build).
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  // Turquesa-petróleo de marca (tailwind.config.ts -> colors.pine.DEFAULT)
  // — color de la barra del navegador/status bar en modo standalone.
  themeColor: "#1E7F95",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${ibmPlexMono.variable}`}
      // Algunas extensiones del navegador (temas, lectores, gestores de
      // contraseñas) le agregan atributos al <html> antes de que React
      // hidrate (ej. data-theme, variables CSS de otra fuente/paleta que no
      // usamos acá) — eso dispara un warning de hydration mismatch que no
      // es un bug real de la app. suppressHydrationWarning en este único
      // elemento es la recomendación oficial de Next.js para este caso
      // puntual, no afecta el resto del árbol.
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-paper font-sans text-ink antialiased">
        <RegisterServiceWorker />
        {children}
      </body>
    </html>
  );
}
