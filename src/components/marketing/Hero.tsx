import { ArrowRight, Building2, Lock, Zap } from "lucide-react";
import { ProductPreview } from "./ProductPreview";

const VERTICAL_OPTIONS = [
  { value: "GENERAL", label: "Consultorio general" },
  { value: "PSICOLOGIA", label: "Psicología" },
  { value: "NUTRICION", label: "Nutrición" },
  { value: "FISIOTERAPIA", label: "Fisioterapia" },
  { value: "ESTETICA", label: "Estética" },
] as const;

// Hero oscuro con resplandor radial en tonos pine/gold (sin imágenes, solo
// CSS) — misma energía que el hero de agendapro.com/co pero en la paleta
// de marca del producto. `pt-32`/`sm:pt-36` compensa el header `fixed` de
// MarketingHeader.tsx, que no reserva su propio espacio en el flujo.
export function Hero() {
  return (
    <section id="producto" className="relative overflow-hidden bg-ink pb-20 pt-32 scroll-mt-24 sm:pt-40">
      {/* Resplandores decorativos, puramente visuales — aria-hidden */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-pine/25 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -right-20 h-80 w-80 rounded-full bg-gold/15 blur-[100px]"
      />

      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-6 lg:grid-cols-2 lg:gap-16">
        <div>
          <span className="inline-flex items-center rounded-full border border-paper/20 bg-paper/10 px-3 py-1 text-xs font-medium text-paper/90 backdrop-blur">
            Para consultorios y clínicas de salud
          </span>

          <h1 className="mt-5 font-display text-4xl font-bold leading-[1.05] tracking-tight text-paper sm:text-5xl lg:text-6xl">
            Agenda, ficha clínica y pagos en un solo lugar
          </h1>

          <p className="mt-5 max-w-md text-base text-paper/70">
            La plataforma pensada para psicólogos, nutricionistas, fisioterapeutas y
            clínicas de salud. Reservas 24/7, recordatorios por WhatsApp y cobros
            confirmados al instante — sin costos escondidos.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href="#registro" className="btn-hero-primary">
              Prueba gratis
              <ArrowRight className="h-4 w-4" />
            </a>
            <a href="#precios" className="btn-hero-ghost">
              Ver precios
            </a>
          </div>

          <dl className="mt-8 flex flex-wrap gap-x-6 gap-y-2.5 text-xs text-paper/55">
            <div className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 flex-none text-pine-light" aria-hidden />
              <dt className="sr-only">Seguridad</dt>
              <dd>Contraseñas cifradas, nunca en texto plano</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 flex-none text-pine-light" aria-hidden />
              <dt className="sr-only">Aislamiento de datos</dt>
              <dd>Datos aislados por clínica (multi-tenant)</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 flex-none text-pine-light" aria-hidden />
              <dt className="sr-only">Pagos</dt>
              <dd>Pagos confirmados por webhook, no por revisión manual</dd>
            </div>
          </dl>

          <form
            id="registro"
            action="/signup"
            method="GET"
            className="mt-8 max-w-md scroll-mt-24 rounded-2xl border border-ink/5 bg-paper p-4 shadow-2xl shadow-ink/30"
          >
            <p className="text-sm font-semibold text-ink">Empieza gratis en minutos</p>
            <div className="mt-3 space-y-3">
              <div>
                <label htmlFor="hero-email" className="field-label">
                  Tu email
                </label>
                <input
                  id="hero-email"
                  name="email"
                  type="email"
                  required
                  placeholder="tu@correo.com"
                  className="field-input"
                />
              </div>
              <div>
                <label htmlFor="hero-vertical" className="field-label">
                  ¿Qué necesitas implementar?
                </label>
                <select id="hero-vertical" name="vertical" defaultValue="GENERAL" className="field-input">
                  {VERTICAL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button type="submit" className="btn-primary mt-4 w-full">
              Regístrate gratis
            </button>
          </form>
        </div>

        <ProductPreview />
      </div>
    </section>
  );
}
