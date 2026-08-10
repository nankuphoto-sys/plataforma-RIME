import Image from "next/image";
import { ArrowRight } from "lucide-react";

/**
 * Cada tarjeta usa una foto real de consultorio/especialidad (banco de fotos
 * con licencia libre de uso comercial, en public/images/specialties/) en vez
 * del bloque de color con degradado que había antes. `tone` se conserva como
 * fondo de respaldo (se ve un instante mientras carga la imagen, o si falla)
 * y como base del scrim de abajo. Las 4 marcadas con `vertical` mapean a
 * TenantVertical real; el resto navega a un registro general.
 */
const SPECIALTIES = [
  { name: "Psicología", vertical: "PSICOLOGIA", tone: "from-pine to-pine-dark", image: "/images/specialties/psicologia.jpg" },
  { name: "Nutrición", vertical: "NUTRICION", tone: "from-gold to-pine-dark", image: "/images/specialties/nutricion.jpg" },
  { name: "Fisioterapia", vertical: "FISIOTERAPIA", tone: "from-pine-light to-pine", image: "/images/specialties/fisioterapia.jpg" },
  { name: "Estética", vertical: "ESTETICA", tone: "from-berry to-berry-dark", image: "/images/specialties/estetica.jpg" },
  { name: "Medicina general", vertical: "GENERAL", tone: "from-sage-dark to-ink", image: "/images/specialties/medicina_general.jpg" },
  { name: "Podología", vertical: "GENERAL", tone: "from-gold to-berry-dark", image: "/images/specialties/podologia.jpg" },
  { name: "Fonoaudiología", vertical: "GENERAL", tone: "from-pine to-berry-dark", image: "/images/specialties/fonoaudiologia.jpg" },
  { name: "Terapia ocupacional", vertical: "GENERAL", tone: "from-berry to-pine-dark", image: "/images/specialties/terapia_ocupacional.jpg" },
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
            <Image
              src={specialty.image}
              alt=""
              fill
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
              className="object-cover"
              aria-hidden
            />
            {/* Scrim oscuro abajo para que el texto blanco siempre se lea,
                sin importar qué tan clara sea la foto de fondo. */}
            <div
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-ink/80 via-ink/20 to-transparent"
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
