import Link from "next/link";
import { requireDashboardAccess } from "@/lib/auth-guards";

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

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="page-title">Función no disponible en tu plan</h1>
      <p className="mt-4 text-sm text-ink/60">
        Tu plan actual ({tenant.plan}) no incluye {feature ?? "esta función"}.
        {requiredPlan && ` Necesitas al menos el plan ${requiredPlan}.`}
      </p>
      <Link href={`/dashboard/${tenantSlug}`} className="shell-link mt-6 inline-block">
        ← Volver a la agenda
      </Link>
    </div>
  );
}
