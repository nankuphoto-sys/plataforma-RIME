import Link from "next/link";
import { LogIn } from "lucide-react";

// Navbar flotante en pastilla (no una barra plana pegada al borde) — el
// mismo lenguaje visual de referencia que agendapro.com/co: `fixed` (no
// `sticky`) a propósito, para que NO reserve su propio espacio en el flujo
// normal — así queda flotando directo sobre el fondo oscuro del Hero desde
// el primer pixel, en vez de dejar una franja clara arriba antes de que
// empiece el hero. Hero.tsx compensa con padding-top para que su contenido
// no quede tapado debajo del header.
export function MarketingHeader() {
  return (
    <header className="fixed inset-x-0 top-3 z-40 mx-auto max-w-6xl px-3 sm:top-4 sm:px-6">
      <div className="flex items-center justify-between gap-4 rounded-full border border-ink/5 bg-paper/95 px-4 py-2.5 shadow-lg shadow-ink/10 backdrop-blur">
        <Link href="/" className="flex items-center gap-2 pl-1">
          <span className="h-2.5 w-2.5 rounded-full bg-pine" aria-hidden />
          <span className="font-display text-lg font-semibold text-ink">RIME</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          <a href="#producto" className="shell-link">
            Producto
          </a>
          <a href="#precios" className="shell-link">
            Precios
          </a>
          <a href="#faq" className="shell-link">
            Recursos
          </a>
        </nav>

        <div className="flex items-center gap-1.5">
          <a href="#pacientes" className="hidden sm:inline-flex btn-secondary-sm">
            Buscar especialista
          </a>
          <Link
            href="/login"
            aria-label="Iniciar sesión"
            className="group inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-ink/70 transition-colors hover:text-pine"
          >
            <LogIn className="h-4 w-4 transition-transform duration-150 ease-out group-hover:translate-x-0.5" />
            <span className="hidden sm:inline">Iniciar sesión</span>
          </Link>
          <Link href="/signup" className="btn-primary rounded-full">
            Regístrate gratis
          </Link>
        </div>
      </div>
    </header>
  );
}
