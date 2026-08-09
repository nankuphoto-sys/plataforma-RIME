import Link from "next/link";

export default function TratamientoDatosPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-sm">
        <Link href="/" className="shell-link">
          ← Volver al inicio
        </Link>
      </p>
      <h1 className="page-title mt-4">Tratamiento de datos personales</h1>
      <p className="page-subtitle mt-2">Borrador — pendiente de revisión legal antes de publicación.</p>

      <div className="mt-6 space-y-4 text-sm leading-relaxed text-ink/70">
        <p>
          Los datos de tus pacientes (ficha clínica, historial de citas) le pertenecen a tu negocio, no a
          RIME. Los usamos únicamente para operar la agenda, los recordatorios y los pagos
          que vos configurás.
        </p>
        <p>
          Los campos de la ficha clínica son configurables por especialidad y quedan bajo tu control:
          vos decidís qué información se recolecta de cada paciente.
        </p>
        <p>
          Para ejercer derechos de acceso, corrección o eliminación de datos, escribinos a{" "}
          <a className="shell-link" href="mailto:soporte@plataforma-agenda.com">
            soporte@plataforma-agenda.com
          </a>
          .
        </p>
      </div>
    </main>
  );
}
