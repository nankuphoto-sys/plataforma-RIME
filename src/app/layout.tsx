import type { Metadata } from "next";
import { Fraunces, Plus_Jakarta_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  // 700 se suma para el headline del hero de la home pública (necesita más
  // peso que el resto de los títulos del producto, que se quedan en 600).
  weight: ["500", "600", "700"],
  style: ["normal"],
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
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
      className={`${fraunces.variable} ${plusJakartaSans.variable} ${ibmPlexMono.variable}`}
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
