import Link from "next/link";
import {
  ArrowRight,
  ArrowRightLeft,
  BarChart3,
  Camera,
  Clock,
  FileText,
  Gift,
  Heart,
  Layers,
  Lock,
  Megaphone,
  Package,
  type LucideIcon,
} from "lucide-react";
import type { Plan } from "@prisma/client";
import { requireDashboardAccess } from "@/lib/auth-guards";
import { PLAN_OPTIONS, describePlan } from "@/lib/planDisplay";

// Mismos slugs en español que ya usan todos los redirect a esta página (ver
// auth-guards.ts, services/actions.ts, pdf.tsx) — acá solo se les suma
// ícono y una frase de una línea sobre qué hace la función, para que la
// pantalla explique el valor de lo que falta, no solo que falta.
const FEATURE_INFO: Record<string, { label: string; description: string; icon: LucideIcon }> = {
  reportes: {
    label: "Reportes",
    description: "Ingresos, comisiones y ocupación de tu negocio, con exportación a PDF y CSV.",
    icon: BarChart3,
  },
  recetas: {
    label: "Recetas digitales",
    description: "Recetas para tus pacientes sin depender de papel.",
    icon: FileText,
  },
  inventario: {
    label: "Inventario",
    description: "Controla el stock de insumos y productos, con alertas cuando algo se agota.",
    icon: Package,
  },
  paquetes: {
    label: "Paquetes de sesiones",
    description: "Vende bonos de sesiones prepagas a tus clientes.",
    icon: Layers,
  },
  fidelidad: {
    label: "Fidelidad",
    description: "Premia la constancia de tus clientes con un programa de sellos.",
    icon: Heart,
  },
  "lista-de-espera": {
    label: "Lista de espera",
    description: "Ofrece automáticamente un cupo liberado al primero en la fila.",
    icon: Clock,
  },
  fotos: {
    label: "Fotos de seguimiento",
    description: "Guarda una línea de tiempo de fotos por cliente.",
    icon: Camera,
  },
  marketing: {
    label: "Marketing",
    description: "Campañas de email segmentadas para tu base de clientes.",
    icon: Megaphone,
  },
  "gift-cards": {
    label: "Gift cards",
    description: "Vende gift cards que tus clientes canjean en cualquier cita.",
    icon: Gift,
  },
};

function isPlan(value: string | undefined): value is Plan {
  return PLAN_OPTIONS.some((option) => option.value === value);
}

export default async function PlanRequiredPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ feature?: string; requiredPlan?: string }>;
}) {
  const { tenantSlug } = await params;
  const { feature, requiredPlan } = await searchParams;
  const { tenant } = await requireDashboardAccess(tenantSlug);

  const info = feature ? FEATURE_INFO[feature] : undefined;
  const FeatureIcon = info?.icon ?? Lock;
  const featureLabel = info?.label ?? feature ?? "Esta función";

  const currentPlanOption = PLAN_OPTIONS.find((option) => option.value === tenant.plan);
  const requiredPlanOption = isPlan(requiredPlan)
    ? PLAN_OPTIONS.find((option) => option.value === requiredPlan)
    : undefined;

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="page-title">{featureLabel} no está en tu plan</h1>
      {info && <p className="page-subtitle">{info.description}</p>}

      <div className="panel mt-6 flex items-start gap-4">
        <span
          className="relative flex h-14 w-14 flex-none items-center justify-center rounded-full bg-pine/10 text-pine-dark"
          aria-hidden
        >
          <FeatureIcon className="h-6 w-6" />
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-gold text-ink ring-2 ring-white">
            <Lock className="h-3 w-3" />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Tu plan</p>
              <p className="mt-0.5 font-medium text-ink">
                {currentPlanOption?.label ?? tenant.plan}
              </p>
            </div>
            <ArrowRight className="h-4 w-4 flex-none text-ink/25" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Necesitas</p>
              <p className="mt-0.5 font-medium text-pine-dark">
                {requiredPlanOption ? requiredPlanOption.label : requiredPlan ?? "un plan superior"}
                {requiredPlanOption && (
                  <span className="ml-1.5 font-normal text-ink/50">
                    · {describePlan(requiredPlanOption).split(" — ")[0]}
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Link href={`/dashboard/${tenantSlug}/billing`} className="btn-primary">
          <ArrowRightLeft className="h-4 w-4" />
          Ver planes y precios
        </Link>
        <Link href={`/dashboard/${tenantSlug}`} className="shell-link">
          ← Volver a la agenda
        </Link>
      </div>
    </div>
  );
}
