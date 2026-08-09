"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface NavLinkProps {
  href: string;
  // true para rutas "raíz" (ej. la Agenda, que vive en /dashboard/[tenantSlug]
  // sin segmento propio) — si no, cualquier subruta del dashboard matchearía
  // como prefijo y la Agenda quedaría marcada activa en todas las páginas.
  exact?: boolean;
  className?: string;
  activeClassName?: string;
  children: ReactNode;
}

// Recibe el ícono + label ya renderizados como `children` desde el Server
// Component que lo usa (layout.tsx) — así el único código que corre en el
// cliente es la comparación de pathname, sin tener que pasar componentes de
// ícono (funciones) como prop a través del límite server/client.
export function NavLink({ href, exact = false, className = "", activeClassName = "", children }: NavLinkProps) {
  const pathname = usePathname() ?? "";
  const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={isActive ? `${className} ${activeClassName}`.trim() : className}
    >
      {children}
    </Link>
  );
}
