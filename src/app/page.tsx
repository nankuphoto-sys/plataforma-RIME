export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-bold">Plataforma Agenda</h1>
      <p className="text-gray-600">
        Scaffold inicial: Next.js + TypeScript + Prisma + PostgreSQL.
        Este panel será el dashboard interno (agenda, CRM, caja, reportes).
        La página pública de reservas vive en{" "}
        <code className="rounded bg-gray-200 px-1">/book/[slug]</code>.
      </p>
      <p className="text-sm text-gray-400">
        Revisa <code>CLAUDE.md</code> y <code>README.md</code> para el contexto
        del proyecto y los próximos pasos.
      </p>
    </main>
  );
}
