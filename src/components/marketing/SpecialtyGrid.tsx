import { ArrowRight } from "lucide-react";

/**
 * El proyecto no tiene assets de fotografía todavía, así que cada tarjeta usa
 * un bloque de color con degradado como marcador de posición — pensado para
 * reemplazarse por una foto real de consultorio/especialidad (no una ilustración
 * genérica) antes de publicar. Las 4 marcadas con `vertical` mapean a
 * TenantVertical real; el resto navega a un registro general. Los degradados
 * son intencionalmente más saturados que antes: ahora el color ES la tarjeta
 * completa (estilo "foto de portada" con el nombre superpuesto), no una franja
 * chica arriba de una tarjeta blanca — necesita más contraste para que el
 * texto blanco se lea encima.
 */
const SPECIALTIES = [
  { name: "Psicología", vertical: "PSICOLOGIA", tone: "from-pine to-pine-dark" },
  { name: "Nutrición", vertical: "NUTRICION", tone: "from-gold to-pine-dark" },
  { name: "Fisioterapia", vertical: "FISIOTERAPIA", tone: "from-pine-light to-pine" },
  { name: "Estética", vertical: "ESTETICA", tone: "from-berry to-berry-dark" },
  { name: "Medicina general", vertical: "GENERAL", tone: "from-sage-dark to-ink" },
  { name: "Podología", vertical: "GENERAL", tone: "from-gold to-berry-dark" },
  { name: "Fonoaudiología", vertical: "GENERAL", tone: "from-pine to-berry-dark" },
  { name: "Terapia ocupacional", vertical: "GENERAL", tone: "from-berry to-pine-dark" },
] as const;

export function SpecialtyGrid() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-16">
      <div className="mx-auto max-w-xl text-center">
        <h2 className="section-title text-2xl">Hecho para tu especialidad</h2>
        <p className="page-subtitle mt-2">
          Cada vertical tiene su propia ficha clínica — no un formulario genérico.
        </p>
      </div>

      <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {SPECIALTIES.map((specialty) => (
          <a
            key={specialty.name}
            href={`/signup?vertical=${specialty.vertical}`}
            className={`specialty-card group bg-gradient-to-br ${specialty.tone}`}
          >
            {/* Scrim oscuro abajo para que el texto blanco siempre se lea,
                sin importar qué tan claro sea el degradado de fondo. */}
            <div
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-ink/70 via-ink/10 to-transparent"
            />
            <div className="relative flex h-full flex-col justify-end p-4">
              <div className="flex items-end justify-between gap-2">
                <span className="text-sm font-semibold text-paper drop-shadow-sm">{specialty.name}</span>
                <span className="specialty-arrow" aria-hidden>
                  <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
