import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireDashboardAccess } from "@/lib/auth-guards";
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
  const { tenant } = await requireDashboardAccess(tenantSlug);

  // Filtramos por tenantId además del id: no queremos que alguien acceda a un
  // cliente de otro tenant adivinando el id en la URL.
  const client = await prisma.client.findFirst({
    where: { id: clientId, tenantId: tenant.id },
  });
  if (!client) notFound();

  const appointments = await prisma.appointment.findMany({
    where: { clientId: client.id, tenantId: tenant.id },
    include: { service: true },
    orderBy: { startsAt: "desc" },
  });

  const fieldTemplate = await getEffectiveClientFieldTemplate(tenant.id, tenant.vertical);
  const customFields = (client.customFields ?? {}) as Record<string, unknown>;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/dashboard/${tenantSlug}/clients`} className="shell-link">
        ← Volver a clientes
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
