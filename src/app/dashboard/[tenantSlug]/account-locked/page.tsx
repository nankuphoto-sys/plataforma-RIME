import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasAnyOfRolesInTenantLocations } from "@/lib/authorization";

// Esta página NO puede usar requireDashboardAccess: ese guard redirige acá
// mismo cuando el tenant está PAST_DUE/CANCELLED, así que reusarlo
// causaría un loop infinito de redirects. Chequeo propio, liviano: sesión
// válida + que el tenant de la URL sea el del usuario — sin verificar rol
// ni status (para eso está esta página, salvo el chequeo de OWNER de más
// abajo, que es solo para decidir qué mensaje mostrar, no para bloquear el
// acceso a esta pantalla en sí).
//
// Deliberadamente NO reimplementa acá los botones de reactivación por
// proveedor (Stripe vs Wompi) — toda esa lógica vive en una única fuente de
// verdad en /billing (requireBillingAccess ya está exenta del hard-lock,
// por eso puede recibir a un tenant CANCELLED/PAST_DUE). Esta pantalla solo
// decide si mandar al usuario ahí o pedirle que hable con su OWNER.
export default async function AccountLockedPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    include: { locations: true },
  });
  if (!tenant) notFound();
  if (session.user.tenantId !== tenant.id) notFound();

  // Solo OWNER tiene acceso a /billing (requireBillingAccess) — un
  // STAFF/ADMIN/PROFESSIONAL que caiga acá no puede arreglar nada él mismo,
  // así que se le pide que hable con el dueño de la cuenta en vez de
  // mandarlo a un link que le va a dar 404.
  const isOwner = hasAnyOfRolesInTenantLocations(
    session.user.locationRoles,
    tenant.locations.map((location) => location.id),
    ["OWNER"]
  );

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="page-title">Cuenta bloqueada</h1>
      <p className="mt-4 text-sm text-ink/60">
        Tu cuenta está {tenant.status === "PAST_DUE" ? "con un pago pendiente" : "cancelada"}.{" "}
        {isOwner
          ? "Andá a Facturación para actualizar tu método de pago o reactivar la suscripción."
          : "Pedile al dueño de la cuenta (rol OWNER) que la reactive desde Facturación."}
      </p>

      {isOwner && (
        <Link href={`/dashboard/${tenantSlug}/billing`} className="btn-primary mt-4 inline-flex">
          Ir a Facturación
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}
