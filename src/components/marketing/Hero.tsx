import { Building2, Lock, Zap } from "lucide-react";

const VERTICAL_OPTIONS = [
  { value: "GENERAL", label: "Consultorio general" },
  { value: "PSICOLOGIA", label: "Psicología" },
  { value: "NUTRICION", label: "Nutrición" },
  { value: "FISIOTERAPIA", label: "Fisioterapia" },
  { value: "ESTETICA", label: "Estética" },
] as const;

// Hero a pantalla completa con video de fondo (loop, sin sonido) — mismo
// lenguaje que el hero de booksy.com/es-co (foto/video + overlay oscuro +
// headline centrado), pedido explícito del usuario. `motion-reduce:hidden`
// en el <video> apaga la reproducción para quien pide menos movimiento
// (display:none detiene el video en todos los navegadores, no solo lo
// oculta) — el <div> con la imagen fija de respaldo se muestra en su lugar
// vía `motion-reduce:block`. `pt-32`/`sm:pt-36` compensa el header `fixed`
// de MarketingHeader.tsx, que no reserva su propio espacio en el flujo.
export function Hero() {
  return (
    <section id="producto" className="relative overflow-hidden bg-ink pb-24 pt-32 scroll-mt-24 sm:pt-40">
      <video
        className="absolute inset-0 h-full w-full object-cover motion-reduce:hidden"
        autoPlay
        muted
        loop
        playsInline
        poster="/video/hero-poster.png"
        aria-hidden
      >
        <source src="/video/hero.mp4" type="video/mp4" />
      </video>
      <div
        className="absolute inset-0 hidden h-full w-full bg-cover bg-center motion-reduce:block"
        style={{ backgroundImage: "url(/video/hero-poster.png)" }}
        aria-hidden
      />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/75 to-ink/55" aria-hidden />

      <div className="relative mx-auto max-w-2xl px-6 text-center">
        <span className="inline-flex items-center rounded-full border border-paper/20 bg-paper/10 px-3 py-1 text-xs font-medium text-paper/90 backdrop-blur">
          Para consultorios y clínicas de salud
        </span>

        <h1 className="mt-5 font-display text-4xl font-bold leading-[1.05] tracking-tight text-paper sm:text-5xl lg:text-6xl">
          Agenda, ficha clínica y pagos en un solo lugar
        </h1>

        <p className="mx-auto mt-5 max-w-md text-base text-paper/70">
          La plataforma pensada para psicólogos, nutricionistas, fisioterapeutas y
          clínicas de salud. Reservas 24/7, recordatorios por WhatsApp y cobros
          confirmados al instante — sin costos escondidos.
        </p>

        {/* Fase 0, tarea 0-7 del plan de ejecución: antes había un botón
            "Prueba gratis" acá que solo hacía scroll hasta el formulario de
            abajo (id="registro") — quedaban dos pedidos de "empezá" visibles
            en la misma pantalla (este botón + el formulario embebido a
            metros de distancia), ambigüedad que señaló el panel de
            producto/UX. El formulario es la única acción de inicio del
            hero; acá queda solo el link informativo. */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a href="#precios" className="btn-hero-ghost">
            Ver precios
          </a>
        </div>

        <dl className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5 text-xs text-paper/55">
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
          className="mx-auto mt-8 max-w-md scroll-mt-24 rounded-2xl border border-ink/5 bg-paper p-4 text-left shadow-2xl shadow-ink/30"
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
    </section>
  );
}
