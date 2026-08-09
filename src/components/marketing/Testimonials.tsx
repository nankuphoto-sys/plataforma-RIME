/**
 * IMPORTANTE: son citas de ejemplo para ilustrar el formato de la sección
 * (nombre + rol + estrellas + cita corta), no testimonios reales de clientes
 * — el producto todavía no tiene clientes en producción. Reemplazar por
 * reseñas reales antes de publicar; mostrar estas como si fueran genuinas
 * sería engañoso.
 */
const TESTIMONIALS = [
  {
    name: "Camila R.",
    role: "Psicóloga clínica, consulta privada",
    quote:
      "Dejé de perder pacientes por no contestar el WhatsApp a tiempo — ahora reservan solos y les llega el recordatorio automático.",
  },
  {
    name: "Andrés M.",
    role: "Director, clínica de fisioterapia (2 sedes)",
    quote:
      "Poder dar acceso a cada sede por separado, sin que un fisioterapeuta vea la agenda de la otra sucursal, era justo lo que necesitábamos.",
  },
  {
    name: "Valentina S.",
    role: "Nutricionista",
    quote:
      "El pago queda confirmado al momento, no días después. Eso solo ya vale la suscripción.",
  },
];

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
