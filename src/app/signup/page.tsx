import Link from "next/link";
import { PLAN_OPTIONS, describePlan } from "@/lib/planDisplay";
import { signUpTenantAction } from "./actions";

const VERTICAL_OPTIONS = [
  { value: "GENERAL", label: "General" },
  { value: "PSICOLOGIA", label: "Psicología" },
  { value: "NUTRICION", label: "Nutrición" },
  { value: "FISIOTERAPIA", label: "Fisioterapia" },
  { value: "ESTETICA", label: "Estética" },
  { value: "BARBERIA", label: "Barbería" },
] as const;

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; vertical?: string; email?: string }>;
}) {
  const { error, vertical, email } = await searchParams;
  const defaultVertical = VERTICAL_OPTIONS.some((option) => option.value === vertical)
    ? vertical
    : "GENERAL";

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <h1 className="text-2xl font-bold">Crea tu cuenta</h1>
      <p className="mt-2 text-sm text-gray-500">
        Registra tu negocio y empieza a usar RIME. ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="underline">
          Inicia sesión
        </Link>
        .
      </p>

      <form action={signUpTenantAction} className="mt-6 space-y-6">
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="businessName">
              Nombre del negocio
            </label>
            <input
              id="businessName"
              name="businessName"
              type="text"
              required
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="vertical">
              Rubro
            </label>
            <select
              id="vertical"
              name="vertical"
              defaultValue={defaultVertical}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {VERTICAL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="plan">
              Plan
            </label>
            <select
              id="plan"
              name="plan"
              defaultValue="INDIVIDUAL"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {PLAN_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} — {describePlan(option)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-4 border-t border-gray-200 pt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="ownerName">
              Tu nombre completo
            </label>
            <input
              id="ownerName"
              name="ownerName"
              type="text"
              required
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              defaultValue={email}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="password">
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="passwordConfirmation">
              Confirmar contraseña
            </label>
            <input
              id="passwordConfirmation"
              name="passwordConfirmation"
              type="password"
              required
              minLength={8}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="space-y-4 border-t border-gray-200 pt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="locationName">
              Nombre de tu primera sede
            </label>
            <input
              id="locationName"
              name="locationName"
              type="text"
              required
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="timezone">
              Timezone
            </label>
            <input
              id="timezone"
              name="timezone"
              type="text"
              defaultValue="America/Santiago"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <button
          type="submit"
          className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Crear cuenta
        </button>
      </form>
    </main>
  );
}
