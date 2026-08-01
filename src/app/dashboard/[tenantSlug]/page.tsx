import Link from "next/link";
import { prisma } from "@/lib/prisma";
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
import { hasLocationAccess } from "@/lib/authorization";
import {
  WeeklyAgenda,
  type AgendaAppointmentBlock,
  type AgendaProfessional,
} from "./WeeklyAgenda";

function formatWeekRangeLabel(weekDates: CalendarDate[]): string {
  if (weekDates.length === 0) return "";
  const start = weekDates[0];
  const end = weekDates[weekDates.length - 1];
  const sameYear = start.year === end.year;

  const format = (date: CalendarDate, withYear: boolean) =>
    new Date(Date.UTC(date.year, date.month - 1, date.day, 12)).toLocaleDateString("es-CL", {
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

  const referenceDate = parseCalendarDateKey(week ?? "") ?? getTodayInTimezone(location.timezone);
  const weekDates = getWeekDates(referenceDate);
  const dayBounds = weekDates.map((date) => getDayBoundsUtc(date, location.timezone));
  const rangeStart = dayBounds[0].start;
  const rangeEnd = dayBounds[dayBounds.length - 1].end;

  const [appointments, locationProfessionals] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        tenantId: tenant.id,
        locationId: location.id,
        startsAt: { gte: rangeStart, lt: rangeEnd },
      },
      include: { client: true, service: true },
      orderBy: { startsAt: "asc" },
    }),
    prisma.professional.findMany({
      where: {
        tenantId: tenant.id,
        active: true,
        professionalLocations: { some: { locationId: location.id } },
      },
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
      },
    ];
  });

  const professionals: AgendaProfessional[] = locationProfessionals.map((professional) => ({
    id: professional.id,
    name: professional.name,
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
              Cambiar
            </button>
          </form>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <Link href={`/dashboard/${tenantSlug}?week=${prevWeekKey}&locationId=${location.id}`} className="btn-secondary">
          ← Semana anterior
        </Link>
        <p className="data-mono text-sm font-medium text-ink/70">{formatWeekRangeLabel(weekDates)}</p>
        <Link href={`/dashboard/${tenantSlug}?week=${nextWeekKey}&locationId=${location.id}`} className="btn-secondary">
          Semana siguiente →
        </Link>
      </div>

      <div className="mt-6">
        <WeeklyAgenda
          tenantSlug={tenantSlug}
          locationTimezone={location.timezone}
          weekDates={weekDates}
          professionals={professionals}
          blocks={blocks}
        />
      </div>
    </div>
  );
}
