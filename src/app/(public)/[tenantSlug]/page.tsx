import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { BookingWizard } from "./BookingWizard";
import { PostCheckoutStatus, type PostCheckoutAppointment } from "./PostCheckoutStatus";
import { confirmWompiTransactionById } from "@/lib/wompiPayment";
import { StarRating } from "@/components/ui/StarRating";

// Página pública de reservas: /[tenantSlug]
// Ej: agendapro.com/consultorio-demo -> aquí sería tuapp.com/consultorio-demo
export default async function PublicBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ appointment?: string; payment?: string; wompi?: string; id?: string; from?: string }>;
}) {
  const { tenantSlug } = await params;
  const { appointment: appointmentId, payment, wompi, id: wompiTransactionId, from } = await searchParams;
  const bookingSource = from === "marketplace" ? "MARKETPLACE" : "WEBSITE";

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

  const visibleReviewsWhere = { tenantId: tenant.id, visible: true, submittedAt: { not: null } } as const;
  const [reviewStats, recentReviews] = await Promise.all([
    prisma.review.aggregate({ where: visibleReviewsWhere, _avg: { rating: true }, _count: true }),
    prisma.review.findMany({
      where: visibleReviewsWhere,
      orderBy: { submittedAt: "desc" },
      take: 5,
      include: { client: true },
    }),
  ]);

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

        {reviewStats._count > 0 && (
          <div className="mt-4 border-t border-sage-dark/30 pt-4">
            <div className="flex items-center gap-2">
              <StarRating value={reviewStats._avg.rating ?? 0} size="sm" />
              <p className="text-sm text-ink/60">
                {(reviewStats._avg.rating ?? 0).toFixed(1)} · {reviewStats._count}{" "}
                {reviewStats._count === 1 ? "reseña" : "reseñas"}
              </p>
            </div>
            <ul className="mt-3 space-y-3">
              {recentReviews.map((review) => (
                <li key={review.id} className="text-sm">
                  <div className="flex items-center gap-2">
                    <StarRating value={review.rating ?? 0} size="sm" />
                    <span className="font-medium text-ink">{review.client.name}</span>
                  </div>
                  {review.comment && <p className="mt-0.5 text-ink/60">&ldquo;{review.comment}&rdquo;</p>}
                </li>
              ))}
            </ul>
          </div>
        )}

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
                source={bookingSource}
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
