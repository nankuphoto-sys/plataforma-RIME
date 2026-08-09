import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { BookingWizard } from "./BookingWizard";
import { PostCheckoutStatus, type PostCheckoutAppointment } from "./PostCheckoutStatus";
import { confirmWompiTransactionById } from "@/lib/wompiPayment";

// Página pública de reservas: /[tenantSlug]
// Ej: agendapro.com/consultorio-demo -> aquí sería tuapp.com/consultorio-demo
export default async function PublicBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ appointment?: string; payment?: string; wompi?: string; id?: string }>;
}) {
  const { tenantSlug } = await params;
  const { appointment: appointmentId, payment, wompi, id: wompiTransactionId } = await searchParams;

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    include: {
      services: { where: { active: true }, orderBy: { name: "asc" } },
      professionals: {
        where: { active: true },
        include: {
          services: { select: { serviceId: true } },
          professionalLocations: { select: { locationId: true } },
        },
      },
      locations: true,
    },
  });

  if (!tenant) return notFound();

  // Si el tenant tiene una sola sede (o ninguna), el comportamiento es
  // idéntico al de antes de esta fase: no aparece paso de sede.
  const location = tenant.locations[0];

  // Si venimos de vuelta de un checkout (Stripe: éxito/cancelación, o Wompi:
  // siempre vuelve con `id` de transacción), mostramos el estado del pago en
  // vez del wizard de reserva.
  let postCheckout: PostCheckoutAppointment | null = null;
  let outcome: "success" | "cancelled" | null =
    payment === "success" || payment === "cancelled" ? payment : null;

  if (wompi === "return" && wompiTransactionId) {
    // A diferencia de Stripe, Wompi no confirma vía success/cancelled en la
    // URL: consultamos su API para saber el estado real antes de mostrar nada.
    await confirmWompiTransactionById(wompiTransactionId);
    outcome = "success";
  }

  if (outcome && appointmentId) {
    const appointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId: tenant.id },
      include: { service: true, professional: true, payment: true, location: true },
    });

    if (appointment) {
      postCheckout = {
        id: appointment.id,
        startsAtIso: appointment.startsAt.toISOString(),
        endsAtIso: appointment.endsAt.toISOString(),
        serviceName: appointment.service.name,
        professionalName: appointment.professional.name,
        locationName: appointment.location.name,
        locationTimezone: appointment.location.timezone,
        paymentStatus: appointment.payment?.status ?? null,
        paymentProvider: appointment.payment?.provider ?? null,
      };
    }
  }

  return (
    <main className="min-h-screen bg-paper">
      <div className="mx-auto max-w-xl px-6 py-14 sm:py-20">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine">Reserva tu cita</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          {tenant.name}
        </h1>

        {postCheckout && outcome ? (
          <PostCheckoutStatus tenantSlug={tenantSlug} appointment={postCheckout} outcome={outcome} />
        ) : (
          <>
            <p className="mt-3 text-sm text-ink/55">Elige un servicio para agendar tu cita.</p>

            {location ? (
              <BookingWizard
                tenantSlug={tenantSlug}
                locations={tenant.locations.map((loc) => ({
                  id: loc.id,
                  name: loc.name,
                  timezone: loc.timezone,
                }))}
                services={tenant.services.map((service) => ({
                  id: service.id,
                  name: service.name,
                  durationMinutes: service.durationMinutes,
                  price: service.price.toString(),
                }))}
                professionals={tenant.professionals.map((professional) => ({
                  id: professional.id,
                  name: professional.name,
                  serviceIds: professional.services.map((s) => s.serviceId),
                  locationIds: professional.professionalLocations.map((pl) => pl.locationId),
                }))}
                depositPolicy={{
                  policy: tenant.depositPolicy,
                  type: tenant.depositType,
                  value: tenant.depositValue?.toString() ?? null,
                }}
              />
            ) : (
              <p className="mt-8 text-sm text-ink/40">
                Este negocio todavía no tiene una sede configurada.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
