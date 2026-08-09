import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Package, Save } from "lucide-react";
import { prisma } from "@/lib/prisma";
import type { SessionPackageStatus } from "@prisma/client";
import { LinkPendingSpinner } from "@/components/ui/LinkPendingSpinner";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { requireDashboardAccess } from "@/lib/auth-guards";
import { hasAnyOfRolesInTenantLocations, isProfessionalOnlyInTenant } from "@/lib/authorization";
import { getLinkedProfessionalId } from "@/lib/professionalScope";
import { getEffectiveClientFieldTemplate } from "@/lib/clientFieldTemplates";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/appointmentStatus";
import { planIncludesModule } from "@/lib/planLimits";
import { canRedeemSession, remainingSessions } from "@/lib/packages";
import { computeWeeklySessionStreak } from "@/lib/streak";
import { cancelPackageAction, createPackageAction, redeemPackageSessionAction, updateClientAction } from "../actions";
import { ClientForm } from "../ClientForm";

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const PACKAGE_STATUS_LABELS: Record<SessionPackageStatus, string> = {
  ACTIVE: "Activo",
  COMPLETED: "Completado",
  EXPIRED: "Vencido",
  CANCELLED: "Cancelado",
};

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; clientId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { tenantSlug, clientId } = await params;
  const { error, saved } = await searchParams;
  const { session, tenant } = await requireDashboardAccess(tenantSlug);

  // Mismo criterio "solo lo mío" que la lista de clientes: un usuario que en
  // todo el tenant solo tiene rol PROFESSIONAL solo puede ver clientes con
  // los que tiene al menos una cita.
  const isProfessionalOnly = isProfessionalOnlyInTenant(
    session.user.locationRoles,
    tenant.locations.map((location) => location.id)
  );
  const viewerProfessionalId = isProfessionalOnly
    ? await getLinkedProfessionalId(session.user.id)
    : null;

  // Filtramos por tenantId además del id: no queremos que alguien acceda a un
  // cliente de otro tenant adivinando el id en la URL. Si es "solo lo mío" y
  // el cliente no tiene ninguna cita con este profesional (o el usuario no
  // tiene ningún profesional vinculado), el `some` no matchea nada y cae
  // igual en el 404 de abajo — mismo resultado que "no existe", sin filtrar
  // que el cliente sí existe para otro profesional.
  const client = await prisma.client.findFirst({
    where: {
      id: clientId,
      tenantId: tenant.id,
      ...(isProfessionalOnly
        ? { appointments: { some: { professionalId: viewerProfessionalId ?? "__sin-profesional-vinculado__" } } }
        : {}),
    },
  });
  if (!client) notFound();

  // Para un profesional "solo lo mío", el historial de citas también se
  // restringe a las suyas — el cliente puede haber tenido sesiones con otro
  // profesional del mismo negocio, y esas no son de su incumbencia.
  const appointments = await prisma.appointment.findMany({
    where: {
      clientId: client.id,
      tenantId: tenant.id,
      ...(isProfessionalOnly ? { professionalId: viewerProfessionalId! } : {}),
    },
    include: { service: true, packageRedemption: true },
    orderBy: { startsAt: "desc" },
  });

  // Nota: Client.customFields es un único JSON compartido por todo el
  // cliente, no por profesional — si el mismo cliente tuvo sesiones con dos
  // profesionales distintos, ambos ven y editan la MISMA ficha (ej. el mismo
  // campo de diagnóstico). Restringir eso requeriría notas por profesional,
  // un modelo de datos nuevo que queda fuera de esta fase.
  const fieldTemplate = await getEffectiveClientFieldTemplate(tenant.id, tenant.vertical);
  const customFields = (client.customFields ?? {}) as Record<string, unknown>;

  // Paquetes de sesiones: sección propia del cliente (como su historial de
  // citas), gateada por plan — oculta en vez de redirigir la página entera,
  // para que un tenant sin el módulo siga viendo el resto de la ficha igual
  // que siempre.
  const packagesEnabled = planIncludesModule(tenant.plan, "packages");
  const hasPackagesManageAccess = hasAnyOfRolesInTenantLocations(
    session.user.locationRoles,
    tenant.locations.map((location) => location.id),
    ["OWNER", "ADMIN"]
  );

  const [packages, activeServices] = packagesEnabled
    ? await Promise.all([
        prisma.sessionPackage.findMany({
          where: { clientId: client.id, tenantId: tenant.id },
          include: { service: true },
          orderBy: { purchasedAt: "desc" },
        }),
        prisma.service.findMany({
          where: { tenantId: tenant.id, active: true },
          orderBy: { name: "asc" },
        }),
      ])
    : [[], []];

  // Citas COMPLETED de este cliente que todavía no se usaron para redimir
  // ninguna sesión de ningún paquete — candidatas al selector opcional de
  // "qué visita usó esta sesión" al redimir.
  const redeemableAppointments = appointments.filter(
    (appointment) => appointment.status === "COMPLETED" && !appointment.packageRedemption
  );

  // Racha de constancia: calculada sobre las mismas citas ya cargadas arriba
  // (sin query nueva) — para un profesional "solo lo mío" refleja solo las
  // semanas con sesión CON ESE profesional, mismo límite ya aceptado que el
  // resto de esta página (ver la nota sobre Client.customFields más abajo).
  const weeklyStreak = computeWeeklySessionStreak(
    appointments.filter((appointment) => appointment.status === "COMPLETED").map((appointment) => appointment.startsAt),
    new Date()
  );

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/dashboard/${tenantSlug}/clients`} className="group inline-flex items-center gap-1 shell-link">
        <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:-translate-x-0.5" />
        Volver a clientes
        <LinkPendingSpinner />
      </Link>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="page-title">{client.name}</h1>
          {weeklyStreak >= 2 && (
            <span className="badge badge-sage" title={`${weeklyStreak} semanas seguidas con al menos una sesión`}>
              🔥 Racha de {weeklyStreak} semanas
            </span>
          )}
        </div>
        <a
          href={`/dashboard/${tenantSlug}/clients/${clientId}/export`}
          className="inline-flex items-center gap-1 shell-link text-sm"
        >
          <Download className="h-3.5 w-3.5" />
          Descargar datos
        </a>
      </div>

      {saved && !error && <p className="msg-success mt-3">Cambios guardados.</p>}

      <ClientForm
        fieldTemplate={fieldTemplate}
        action={updateClientAction.bind(null, tenantSlug, clientId)}
        submitLabel="Guardar cambios"
        errorMessage={error}
        initialValues={{
          name: client.name,
          email: client.email ?? "",
          phone: client.phone ?? "",
          birthdate: client.birthdate ? toDateInputValue(client.birthdate) : "",
          customFields,
        }}
      />

      <section className="mt-10 border-t border-sage-dark/30 pt-6">
        <h2 className="section-title">Historial de citas</h2>
        {appointments.length === 0 ? (
          <p className="mt-3 text-sm text-ink/40">Este cliente todavía no tiene citas.</p>
        ) : (
          <ul className="mt-4 divide-y divide-sage-dark/25">
            {appointments.map((appointment) => (
              <li key={appointment.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="font-medium text-ink">{appointment.service.name}</p>
                  <p className="data-mono text-ink/50">
                    {appointment.startsAt.toLocaleString("es-CL", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
                <span className="text-ink/60">{APPOINTMENT_STATUS_LABELS[appointment.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {packagesEnabled && (
        <section className="mt-6 border-t border-sage-dark/30 pt-6">
          <h2 className="section-title">Paquetes de sesiones</h2>
          {packages.length === 0 ? (
            <p className="mt-3 text-sm text-ink/40">Este cliente todavía no tiene ningún paquete.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {packages.map((pkg) => (
                <li key={pkg.id} className="rounded-xl border border-sage-dark/25 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-ink">
                      {pkg.service?.name ?? "Paquete general"} — {pkg.usedSessions}/{pkg.totalSessions} sesiones
                    </p>
                    <span className="text-ink/60">{PACKAGE_STATUS_LABELS[pkg.status]}</span>
                  </div>
                  <p className="data-mono mt-1 text-ink/50">
                    {remainingSessions(pkg)} sesiones disponibles
                    {pkg.expiresAt &&
                      ` — vence ${pkg.expiresAt.toLocaleDateString("es-CO", { day: "numeric", month: "long" })}`}
                  </p>

                  {canRedeemSession(pkg) && (
                    <form
                      action={redeemPackageSessionAction.bind(null, tenantSlug, clientId, pkg.id)}
                      className="mt-3 flex flex-wrap items-end gap-2"
                    >
                      {redeemableAppointments.length > 0 && (
                        <select name="appointmentId" defaultValue="" className="field-input mt-0 w-auto">
                          <option value="">Sin vincular a una cita</option>
                          {redeemableAppointments.map((appointment) => (
                            <option key={appointment.id} value={appointment.id}>
                              {appointment.service.name} —{" "}
                              {appointment.startsAt.toLocaleDateString("es-CL", { dateStyle: "medium" })}
                            </option>
                          ))}
                        </select>
                      )}
                      <SubmitButton icon={<Package className="h-4 w-4" />} pendingLabel="Redimiendo…">
                        Usar 1 sesión
                      </SubmitButton>
                    </form>
                  )}

                  {hasPackagesManageAccess && pkg.status === "ACTIVE" && (
                    <form action={cancelPackageAction.bind(null, tenantSlug, clientId, pkg.id)} className="mt-2">
                      <button type="submit" className="text-xs text-berry-dark hover:underline">
                        Cancelar paquete
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}

          {hasPackagesManageAccess && (
            <form
              action={createPackageAction.bind(null, tenantSlug, clientId)}
              className="mt-4 flex flex-wrap items-end gap-3 border-t border-sage-dark/20 pt-4"
            >
              <div>
                <label className="field-label" htmlFor="totalSessions">
                  Sesiones
                </label>
                <input
                  id="totalSessions"
                  name="totalSessions"
                  type="number"
                  min="1"
                  step="1"
                  required
                  className="field-input w-24"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="price">
                  Precio (opcional)
                </label>
                <input id="price" name="price" type="number" min="0" step="0.01" className="field-input w-32" />
              </div>
              <div>
                <label className="field-label" htmlFor="expiresAt">
                  Vence (opcional)
                </label>
                <input id="expiresAt" name="expiresAt" type="date" className="field-input" />
              </div>
              {activeServices.length > 0 && (
                <div>
                  <label className="field-label" htmlFor="serviceId">
                    Servicio (opcional)
                  </label>
                  <select id="serviceId" name="serviceId" defaultValue="" className="field-input">
                    <option value="">Paquete general</option>
                    {activeServices.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <SubmitButton icon={<Save className="h-4 w-4" />} pendingLabel="Guardando…">
                Vender paquete
              </SubmitButton>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
