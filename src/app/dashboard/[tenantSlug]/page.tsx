import Link from "next/link";
import { ArrowLeftRight, ChevronLeft, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { LinkPendingSpinner } from "@/components/ui/LinkPendingSpinner";
import { requireDashboardAccess } from "@/lib/auth-guards";
import {
  addDays,
  formatCalendarDateKey,
  getDayBoundsUtc,
  getTodayInTimezone,
  getWeekDates,
  parseCalendarDateKey,
  type CalendarDate,
} from "@/lib/availability";
import { getAppointmentBlockPosition } from "@/lib/appointmentGrid";
import { getRoleAtLocation, hasLocationAccess } from "@/lib/authorization";
import { getLinkedProfessionalId } from "@/lib/professionalScope";
import {
  WeeklyAgenda,
  type AgendaAppointmentBlock,
  type AgendaProfessional,
} from "./WeeklyAgenda";
import type { AgendaClientOption, AgendaServiceOption } from "./NewAppointmentPanel";

function formatWeekRangeLabel(weekDates: CalendarDate[]): string {
  if (weekDates.length === 0) return "";
  const start = weekDates[0];
  const end = weekDates[weekDates.length - 1];
  const sameYear = start.year === end.year;

  const format = (date: CalendarDate, withYear: boolean) =>
    new Date(Date.UTC(date.year, date.month - 1, date.day, 12)).toLocaleDateString("es-CO", {
      day: "numeric",
      month: "short",
      year: withYear ? "numeric" : undefined,
      timeZone: "UTC",
    });

  return `${format(start, !sameYear)} – ${format(end, true)}`;
}

export default async function DashboardAgendaPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ week?: string; locationId?: string }>;
}) {
  const { tenantSlug } = await params;
  const { week, locationId } = await searchParams;

  const { session, tenant } = await requireDashboardAccess(tenantSlug);

  // Sedes a las que este usuario tiene acceso (un OWNER típico tendrá acceso
  // a todas, un STAFF/PROFESSIONAL puede tener acceso a solo una), ordenadas
  // por antigüedad para que el default sea estable.
  const accessibleLocations = tenant.locations
    .filter((loc) => hasLocationAccess(session.user.locationRoles, loc.id))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const requestedLocation = locationId
    ? accessibleLocations.find((loc) => loc.id === locationId)
    : undefined;
  const location = requestedLocation ?? accessibleLocations[0];

  if (!location) {
    return (
      <div className="mx-auto max-w-6xl">
        <h1 className="page-title">Agenda</h1>
        <p className="mt-6 text-sm text-ink/40">Este negocio todavía no tiene una sede configurada.</p>
      </div>
    );
  }

  // Un rol PROFESSIONAL en ESTA sede puntual ve solo su propia agenda, nunca
  // la de sus colegas — a diferencia de OWNER/ADMIN/STAFF, que siguen viendo
  // la sede completa igual que antes. Se calcula por sede (no por tenant)
  // porque un mismo usuario puede tener roles distintos en distintas sedes
  // (ver StaffLocationRole, @@unique([userId, locationId])).
  const roleAtLocation = getRoleAtLocation(session.user.locationRoles, location.id);
  const isProfessionalOnly = roleAtLocation === "PROFESSIONAL";
  const viewerProfessionalId = isProfessionalOnly
    ? await getLinkedProfessionalId(session.user.id)
    : null;

  if (isProfessionalOnly && !viewerProfessionalId) {
    return (
      <div className="mx-auto max-w-6xl">
        <h1 className="page-title">Agenda</h1>
        <p className="mt-6 text-sm text-ink/40">
          Tu usuario todavía no tiene un profesional vinculado en este negocio. Pídele a tu
          administrador que lo revise desde Profesionales.
        </p>
      </div>
    );
  }

  const referenceDate = parseCalendarDateKey(week ?? "") ?? getTodayInTimezone(location.timezone);
  // Los 7 días, no el default de getWeekDates (lunes a viernes, pensado para
  // el flujo público de reserva) — esta es la agenda interna del staff, y
  // "Nueva cita" no restringe a días/horario hábil, así que una cita creada
  // a mano un sábado (o fuera de horario) tiene que poder verse acá. Con el
  // default anterior, esas citas desaparecían de la agenda por completo:
  // seguían ocupando el turno del profesional para el chequeo de solapes,
  // pero no había forma de verlas ni gestionarlas desde esta pantalla.
  const weekDates = getWeekDates(referenceDate, [0, 1, 2, 3, 4, 5, 6]);
  const dayBounds = weekDates.map((date) => getDayBoundsUtc(date, location.timezone));
  const rangeStart = dayBounds[0].start;
  const rangeEnd = dayBounds[dayBounds.length - 1].end;

  const [appointments, locationProfessionals, activeServices, tenantClients] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        tenantId: tenant.id,
        locationId: location.id,
        startsAt: { gte: rangeStart, lt: rangeEnd },
        ...(isProfessionalOnly ? { professionalId: viewerProfessionalId! } : {}),
      },
      include: { client: true, service: true, payment: true },
      orderBy: { startsAt: "asc" },
    }),
    prisma.professional.findMany({
      where: {
        tenantId: tenant.id,
        active: true,
        professionalLocations: { some: { locationId: location.id } },
        ...(isProfessionalOnly ? { id: viewerProfessionalId! } : {}),
      },
      orderBy: { name: "asc" },
    }),
    // Para el formulario de "Nueva cita": servicios activos + qué
    // profesionales de ESTA sede los ofrecen, para filtrar el selector de
    // profesional en cuanto se elige un servicio.
    prisma.service.findMany({
      where: { tenantId: tenant.id, active: true },
      include: { professionals: { select: { professionalId: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.client.findMany({
      where: { tenantId: tenant.id },
      orderBy: { name: "asc" },
    }),
  ]);

  const blocks: AgendaAppointmentBlock[] = appointments.flatMap((appt) => {
    const dayIndex = dayBounds.findIndex(
      (bounds) => appt.startsAt >= bounds.start && appt.startsAt < bounds.end
    );
    if (dayIndex === -1) return [];

    const position = getAppointmentBlockPosition({
      startsAt: appt.startsAt,
      endsAt: appt.endsAt,
      date: weekDates[dayIndex],
      timezone: location.timezone,
    });

    return [
      {
        id: appt.id,
        professionalId: appt.professionalId,
        dayIndex,
        status: appt.status,
        topPercent: position.topPercent,
        heightPercent: position.heightPercent,
        startsAtIso: appt.startsAt.toISOString(),
        endsAtIso: appt.endsAt.toISOString(),
        serviceName: appt.service.name,
        durationMinutes: appt.service.durationMinutes,
        client: {
          name: appt.client.name,
          email: appt.client.email,
          phone: appt.client.phone,
        },
        payment: appt.payment ? { status: appt.payment.status, kind: appt.payment.kind } : null,
      },
    ];
  });

  const professionals: AgendaProfessional[] = locationProfessionals.map((professional) => ({
    id: professional.id,
    name: professional.name,
  }));

  const professionalIdsInLocation = new Set(professionals.map((p) => p.id));
  const services: AgendaServiceOption[] = activeServices.map((service) => ({
    id: service.id,
    name: service.name,
    durationMinutes: service.durationMinutes,
    professionalIds: service.professionals
      .map((link) => link.professionalId)
      .filter((id) => professionalIdsInLocation.has(id)),
  }));

  const clients: AgendaClientOption[] = tenantClients.map((client) => ({
    id: client.id,
    name: client.name,
    email: client.email,
    phone: client.phone,
  }));

  const prevWeekKey = formatCalendarDateKey(addDays(referenceDate, -7));
  const nextWeekKey = formatCalendarDateKey(addDays(referenceDate, 7));

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Agenda</h1>
          <p className="page-subtitle">{location.name}</p>
        </div>

        {accessibleLocations.length > 1 && (
          <form method="get" className="flex items-end gap-2">
            <select
              name="locationId"
              defaultValue={location.id}
              className="field-input mt-0 w-auto"
            >
              {accessibleLocations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
            <button type="submit" className="btn-secondary">
              <ArrowLeftRight className="h-4 w-4" />
              Cambiar
            </button>
          </form>
        )}
      </div>

      {/* Texto del botón oculto en mobile (queda solo el ícono) — dos
          botones con label + el rango de fechas al medio no entran en un
          celular angosto sin desbordar o partirse en dos líneas feo. */}
      <div className="mt-6 flex items-center justify-between">
        <Link href={`/dashboard/${tenantSlug}?week=${prevWeekKey}&locationId=${location.id}`} className="btn-secondary">
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Semana anterior</span>
          <LinkPendingSpinner />
        </Link>
        <p className="data-mono text-sm font-medium text-ink/70">{formatWeekRangeLabel(weekDates)}</p>
        <Link href={`/dashboard/${tenantSlug}?week=${nextWeekKey}&locationId=${location.id}`} className="btn-secondary">
          <LinkPendingSpinner />
          <span className="hidden sm:inline">Semana siguiente</span>
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="mt-6">
        <WeeklyAgenda
          tenantSlug={tenantSlug}
          locationId={location.id}
          locationTimezone={location.timezone}
          weekDates={weekDates}
          professionals={professionals}
          blocks={blocks}
          services={services}
          clients={clients}
        />
      </div>
    </div>
  );
}
