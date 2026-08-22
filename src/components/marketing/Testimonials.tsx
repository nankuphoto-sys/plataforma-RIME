/**
 * Fase 0, tarea 0-6 del plan de ejecución: los 3 testimonios anteriores eran
 * citas de ejemplo sin foto ni negocio verificable — ya habían llegado a
 * producción a pesar del comentario original que advertía no hacerlo. Se
 * sacan de acá (TESTIMONIALS vacío) hasta tener reseñas reales.
 *
 * Para reponer: agregar objetos acá con name/role/quote, IDEALMENTE sumando
 * foto y nombre de negocio verificable (ver Fase 1, tarea 1-8 del plan) —
 * un testimonio sin ninguna forma de verificar que la persona/negocio existe
 * resta credibilidad más de lo que suma. El componente no renderiza nada si
 * el array está vacío, así que no hace falta tocar la página que lo usa.
 */
const TESTIMONIALS: { name: string; role: string; quote: string }[] = [];

function Stars() {
  return (
    <div className="flex gap-0.5 text-gold" aria-label="5 de 5 estrellas">
      {Array.from({ length: 5 }).map((_, index) => (
        <span key={index} aria-hidden>
          ★
        </span>
      ))}
    </div>
  );
}

export function Testimonials() {
  if (TESTIMONIALS.length === 0) return null;

  return (
    <section className="bg-white py-16">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="section-title text-2xl">Lo que dicen quienes lo usan</h2>
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {TESTIMONIALS.map((testimonial) => (
            <figure key={testimonial.name} className="panel flex flex-col">
              <Stars />
              <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-ink/75">
                “{testimonial.quote}”
              </blockquote>
              <figcaption className="mt-4 text-sm">
                <span className="font-semibold text-ink">{testimonial.name}</span>
                <span className="block text-xs text-ink/50">{testimonial.role}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
