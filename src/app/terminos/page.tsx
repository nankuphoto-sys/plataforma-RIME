import Link from "next/link";

export default function TerminosPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-sm">
        <Link href="/" className="shell-link">
          ← Volver al inicio
        </Link>
      </p>
      <h1 className="page-title mt-4">Términos y condiciones</h1>
      <p className="page-subtitle mt-2">Borrador — pendiente de revisión legal antes de publicación.</p>

      <div className="mt-6 space-y-4 text-sm leading-relaxed text-ink/70">
        <p>
          El uso de RIME se factura mensualmente según el plan elegido, sin comisión sobre
          las citas ni los pagos que proceses con tus pacientes.
        </p>
        <p>
          Podés cambiar de plan o cancelar tu suscripción en cualquier momento desde tu panel de
          facturación.
        </p>
        <p>
          Para el detalle completo de estos términos, escribinos a{" "}
          <a className="shell-link" href="mailto:soporte@plataforma-agenda.com">
            soporte@plataforma-agenda.com
          </a>
          .
        </p>
      </div>
    </main>
  );
}
