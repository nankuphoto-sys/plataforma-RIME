import Link from "next/link";

export default function PrivacidadPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-sm">
        <Link href="/" className="shell-link">
          ← Volver al inicio
        </Link>
      </p>
      <h1 className="page-title mt-4">Política de privacidad</h1>
      <p className="page-subtitle mt-2">Borrador — pendiente de revisión legal antes de publicación.</p>

      <div className="mt-6 space-y-4 text-sm leading-relaxed text-ink/70">
        <p>
          RIME opera como un espacio aislado por clínica (multi-tenant): los datos que
          cargás sobre tu negocio y tus pacientes nunca se comparten con otros negocios que usan la
          plataforma.
        </p>
        <p>
          Las contraseñas de las cuentas se almacenan cifradas, nunca en texto plano. Los pagos se
          procesan a través de Stripe y Wompi; no almacenamos números de tarjeta en nuestros servidores.
        </p>
        <p>
          Para cualquier consulta sobre el tratamiento de tus datos, escribinos a{" "}
          <a className="shell-link" href="mailto:soporte@plataforma-agenda.com">
            soporte@plataforma-agenda.com
          </a>
          .
        </p>
      </div>
    </main>
  );
}
