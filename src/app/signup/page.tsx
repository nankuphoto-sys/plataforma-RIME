import Link from "next/link";
import { PLAN_OPTIONS, describePlan } from "@/lib/planDisplay";
import { signUpTenantAction } from "./actions";

const VERTICAL_OPTIONS = [
  { value: "GENERAL", label: "General" },
  { value: "PSICOLOGIA", label: "Psicología" },
  { value: "NUTRICION", label: "Nutrición" },
  { value: "FISIOTERAPIA", label: "Fisioterapia" },
  { value: "ESTETICA", label: "Estética" },
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
    <main className="auth-shell">
      <div className="w-full max-w-xl">
        <Link href="/" className="auth-brand transition-opacity hover:opacity-80">
          <span className="auth-brand-mark">R</span>
          <span className="font-display text-lg font-semibold text-paper">RIME</span>
        </Link>

        <div className="auth-card max-w-xl">
          <h1 className="page-title text-2xl">Crea tu cuenta</h1>
          <p className="page-subtitle">
            Registra tu negocio y empieza a usar RIME. ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="text-pine underline-offset-2 hover:underline">
              Inicia sesión
            </Link>
            .
          </p>

          <form action={signUpTenantAction} className="mt-6 space-y-6">
            {error && <p className="msg-error">{error}</p>}

            <div className="space-y-4">
              <div>
                <label className="field-label" htmlFor="businessName">
                  Nombre del negocio
                </label>
                <input
                  id="businessName"
                  name="businessName"
                  type="text"
                  required
                  className="field-input"
                />
              </div>

              <div>
                <label className="field-label" htmlFor="vertical">
                  Rubro
                </label>
                <select
                  id="vertical"
                  name="vertical"
                  defaultValue={defaultVertical}
                  className="field-input"
                >
                  {VERTICAL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="field-label" htmlFor="plan">
                  Plan
                </label>
                <select id="plan" name="plan" defaultValue="INDIVIDUAL" className="field-input">
                  {PLAN_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label} — {describePlan(option)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-4 border-t border-sage-dark/30 pt-4">
              <div>
                <label className="field-label" htmlFor="ownerName">
                  Tu nombre completo
                </label>
                <input
                  id="ownerName"
                  name="ownerName"
                  type="text"
                  required
                  autoComplete="name"
                  className="field-input"
                />
              </div>

              <div>
                <label className="field-label" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  defaultValue={email}
                  className="field-input"
                />
              </div>

              <div>
                <label className="field-label" htmlFor="password">
                  Contraseña
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="field-input"
                />
              </div>

              <div>
                <label className="field-label" htmlFor="passwordConfirmation">
                  Confirmar contraseña
                </label>
                <input
                  id="passwordConfirmation"
                  name="passwordConfirmation"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="field-input"
                />
              </div>
            </div>

            <div className="space-y-4 border-t border-sage-dark/30 pt-4">
              <div>
                <label className="field-label" htmlFor="locationName">
                  Nombre de tu primera sede
                </label>
                <input
                  id="locationName"
                  name="locationName"
                  type="text"
                  required
                  className="field-input"
                />
              </div>

              <div>
                <label className="field-label" htmlFor="timezone">
                  Timezone
                </label>
                <input
                  id="timezone"
                  name="timezone"
                  type="text"
                  defaultValue="America/Bogota"
                  className="field-input"
                />
              </div>
            </div>

            <button type="submit" className="btn-primary w-full">
              Crear cuenta
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
