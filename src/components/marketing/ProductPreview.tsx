const APPOINTMENTS = [
  { day: "Lun", top: 10, label: "M. Torres", tone: "bg-pine/15 text-pine-dark border-pine/30" },
  { day: "Lun", top: 46, label: "J. Rivas", tone: "bg-gold/15 text-gold border-gold/30" },
  { day: "Mar", top: 22, label: "C. Duarte", tone: "bg-pine/15 text-pine-dark border-pine/30" },
  { day: "Mié", top: 10, label: "A. León", tone: "bg-berry/10 text-berry-dark border-berry/25" },
  { day: "Mié", top: 58, label: "S. Ibarra", tone: "bg-pine/15 text-pine-dark border-pine/30" },
  { day: "Jue", top: 34, label: "P. Nuñez", tone: "bg-gold/15 text-gold border-gold/30" },
  { day: "Vie", top: 16, label: "R. Campos", tone: "bg-pine/15 text-pine-dark border-pine/30" },
] as const;

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie"] as const;

/**
 * Maqueta CSS de la agenda semanal real del dashboard (mismos tokens de color
 * que src/app/globals.css) — no es una captura de pantalla real porque el
 * proyecto no tiene assets de imagen, pero reproduce fielmente su estructura.
 */
export function ProductPreview() {
  return (
    <div className="relative mx-auto max-w-3xl">
      <div className="overflow-hidden rounded-2xl border border-sage-dark/40 bg-white shadow-xl shadow-ink/5">
        <div className="flex items-center gap-2 border-b border-sage-dark/30 bg-sage/40 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-berry/60" aria-hidden />
          <span className="h-2.5 w-2.5 rounded-full bg-gold/60" aria-hidden />
          <span className="h-2.5 w-2.5 rounded-full bg-pine/60" aria-hidden />
          <span className="ml-2 text-xs font-medium text-ink/50">Agenda — Sede Principal</span>
        </div>

        <div className="grid grid-cols-5 gap-2 p-4">
          {DAYS.map((day) => (
            <div key={day} className="space-y-1">
              <p className="text-center text-[11px] font-semibold uppercase tracking-wide text-ink/40">
                {day}
              </p>
              <div className="relative h-40 rounded-lg bg-sage/30">
                {APPOINTMENTS.filter((appt) => appt.day === day).map((appt) => (
                  <div
                    key={`${appt.day}-${appt.label}`}
                    style={{ top: `${appt.top}%` }}
                    className={`absolute inset-x-1 rounded-md border px-1.5 py-1 text-[10px] font-medium leading-tight ${appt.tone}`}
                  >
                    {appt.label}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Anotaciones flotantes */}
      <div className="absolute -left-6 top-8 hidden max-w-[11rem] rounded-lg border border-sage-dark/40 bg-white px-3 py-2 text-xs font-medium text-ink shadow-md lg:block">
        <span className="mr-1 text-pine">●</span>
        Recordatorio de WhatsApp enviado 24h antes
      </div>
      <div className="absolute -right-8 top-1/2 hidden max-w-[11rem] -translate-y-1/2 rounded-lg border border-sage-dark/40 bg-white px-3 py-2 text-xs font-medium text-ink shadow-md lg:block">
        <span className="mr-1 text-gold">●</span>
        Pago confirmado por webhook al instante
      </div>
      <div className="absolute -bottom-6 left-10 hidden max-w-[12rem] rounded-lg border border-sage-dark/40 bg-white px-3 py-2 text-xs font-medium text-ink shadow-md lg:block">
        <span className="mr-1 text-berry-dark">●</span>
        Ficha clínica según tu especialidad
      </div>
    </div>
  );
}
