import type { Metadata } from "next";
import { Plus_Jakarta_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Dirección "cronógrafo": se retira Fraunces (serif cálida) — los títulos
// ahora usan Plus Jakarta Sans en peso alto (--font-display apunta a la
// misma variable que --font-sans, ver tailwind.config.ts `fontFamily.display`)
// para el look técnico/instrumento en vez de editorial. El mono (IBM Plex)
// se mantiene igual, sigue siendo el protagonista de horarios/montos/datos.
const plusJakartaSans = Plus_Jakarta_Sans({
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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`${plusJakartaSans.variable} ${ibmPlexMono.variable}`}
      // Algunas extensiones del navegador (temas, lectores, gestores de
      // contraseñas) le agregan atributos al <html> antes de que React
      // hidrate (ej. data-theme, variables CSS de otra fuente/paleta que no
      // usamos acá) — eso dispara un warning de hydration mismatch que no
      // es un bug real de la app. suppressHydrationWarning en este único
      // elemento es la recomendación oficial de Next.js para este caso
      // puntual, no afecta el resto del árbol.
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-paper font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
