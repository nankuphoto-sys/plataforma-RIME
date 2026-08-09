import { BarChart3, Calendar, CreditCard, FileText, MapPin, MessageCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const FEATURES: { title: string; description: string; icon: LucideIcon }[] = [
  {
    title: "Agenda pública 24/7",
    description: "Tus pacientes reservan solos desde tu link, a cualquier hora.",
    icon: Calendar,
  },
  {
    title: "Recordatorios por WhatsApp",
    description: "Automáticos antes de cada cita, sin costos escondidos.",
    icon: MessageCircle,
  },
  {
    title: "Ficha clínica por especialidad",
    description: "Campos propios para psicología, nutrición, fisioterapia y estética.",
    icon: FileText,
  },
  {
    title: "Pagos con confirmación instantánea",
    description: "Stripe y Wompi, confirmados por webhook en tiempo real.",
    icon: CreditCard,
  },
  {
    title: "Permisos por sede",
    description: "Cada profesional ve solo la agenda y los datos de su sede.",
    icon: MapPin,
  },
  {
    title: "Reportes y comisiones",
    description: "Ingresos y comisión por profesional, exportables a CSV y PDF.",
    icon: BarChart3,
  },
];

// Iconos reales de lucide-react (antes eran SVG dibujados a mano, inconsistentes
// con el resto del proyecto) dentro de un círculo con anillo degradado —
// .feature-icon-badge en globals.css, que reacciona al hover de la tarjeta
// entera (`group` acá, `group-hover:` adentro de la clase).
export function Features() {
  return (
    <section className="bg-white py-16">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="section-title text-2xl">Todo lo que necesita tu consultorio</h2>
          <p className="page-subtitle mt-2">Sin módulos escondidos detrás de un plan superior sorpresa.</p>
        </div>

        <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="group flex gap-4">
                <span className="feature-icon-badge">
                  <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-ink">{feature.title}</h3>
                  <p className="mt-1 text-sm text-ink/60">{feature.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
