import Link from "next/link";

export function MarketingFooter() {
  return (
    <footer className="border-t border-sage-dark/40 bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-12 sm:grid-cols-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-pine" aria-hidden />
            <span className="font-display text-base font-semibold text-ink">RIME</span>
          </div>
          <p className="mt-2 max-w-xs text-sm text-ink/55">
            Agendamiento, ficha clínica y pagos para consultorios y clínicas de salud.
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Producto</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <a href="#producto" className="shell-link">
                Cómo funciona
              </a>
            </li>
            <li>
              <a href="#precios" className="shell-link">
                Precios
              </a>
            </li>
            <li>
              <a href="#faq" className="shell-link">
                Preguntas frecuentes
              </a>
            </li>
          </ul>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Legal</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link href="/privacidad" className="shell-link">
                Política de privacidad
              </Link>
            </li>
            <li>
              <Link href="/tratamiento-datos" className="shell-link">
                Tratamiento de datos
              </Link>
            </li>
            <li>
              <Link href="/terminos" className="shell-link">
                Términos y condiciones
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-sage-dark/30 px-6 py-4 text-center text-xs text-ink/40">
        © {new Date().getFullYear()} RIME. Todos los derechos reservados.
      </div>
    </footer>
  );
}
