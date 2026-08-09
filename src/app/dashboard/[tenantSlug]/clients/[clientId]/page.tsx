import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { LinkPendingSpinner } from "@/components/ui/LinkPendingSpinner";
import { requireDashboardAccess } from "@/lib/auth-guards";
import { isProfessionalOnlyInTenant } from "@/lib/authorization";
import { getLinkedProfessionalId } from "@/lib/professionalScope";
import { getEffectiveClientFieldTemplate } from "@/lib/clientFieldTemplates";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/appointmentStatus";
import { updateClientAction } from "../actions";
import { ClientForm } from "../ClientForm";

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

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
    include: { service: true },
    orderBy: { startsAt: "desc" },
  });

  // Nota: Client.customFields es un único JSON compartido por todo el
  // cliente, no por profesional — si el mismo cliente tuvo sesiones con dos
  // profesionales distintos, ambos ven y editan la MISMA ficha (ej. el mismo
  // campo de diagnóstico). Restringir eso requeriría notas por profesional,
  // un modelo de datos nuevo que queda fuera de esta fase.
  const fieldTemplate = await getEffectiveClientFieldTemplate(tenant.id, tenant.vertical);
  const customFields = (client.customFields ?? {}) as Record<string, unknown>;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/dashboard/${tenantSlug}/clients`} className="group inline-flex items-center gap-1 shell-link">
        <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:-translate-x-0.5" />
        Volver a clientes
        <LinkPendingSpinner />
      </Link>
      <h1 className="page-title mt-3">{client.name}</h1>

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
    </div>
  );
}
