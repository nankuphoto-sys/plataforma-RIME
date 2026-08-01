import type { AppointmentStatus } from "@prisma/client";

// Transiciones de estado permitidas desde la agenda interna. Compartido
// entre la server action (fuente de verdad) y la UI (para mostrar solo los
// botones de estado válidos) — evita duplicar la regla de negocio.
// COMPLETED, CANCELLED y NO_SHOW son estados terminales.
export const ALLOWED_STATUS_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED", "NO_SHOW"],
  CONFIRMED: ["COMPLETED", "CANCELLED", "NO_SHOW"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmada",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
  NO_SHOW: "No asistió",
};
