import { AnimatedNumber } from "@/components/ui/AnimatedNumber";

// Solo se anima lo que es realmente un número entero contable (2, 4) — "24/7"
// no es una cantidad que tenga sentido "contar" y "0" no se nota animado,
// así que esos dos quedan estáticos en vez de forzar la animación en todos.
const STATS = [
  { display: "24/7", label: "Agenda pública de reservas" },
  { display: "100%", label: "Pagos con confirmación instantánea por webhook" },
  { value: 4, label: "Especialidades con ficha clínica propia" },
  { display: "0", label: "Costos ocultos en recordatorios por WhatsApp" },
] as const;

export function StatsBar() {
  return (
    <section className="bg-pine">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-6 py-12 sm:grid-cols-4 sm:gap-4">
        {STATS.map((stat) => (
          <div key={stat.label} className="text-center sm:text-left">
            <p className="font-display text-4xl font-bold tracking-tight text-paper sm:text-5xl">
              {"value" in stat ? <AnimatedNumber value={stat.value} /> : stat.display}
            </p>
            <p className="mt-1.5 text-xs leading-snug text-paper/70">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
