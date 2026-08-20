import Link from "next/link";
import { isGoogleAuthEnabled } from "@/lib/auth";
import { PLAN_OPTIONS, describePlan } from "@/lib/planDisplay";
import { signInWithGoogleAction } from "../login/actions";
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

          {isGoogleAuthEnabled && (
            <>
              <form action={signInWithGoogleAction} className="mt-6">
                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-sage-dark/30 bg-paper px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-sage/20"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
                    <path
                      fill="#4285F4"
                      d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.82Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.07 7.94-2.91l-3.88-3c-1.08.72-2.46 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.94H1.28v3.1A12 12 0 0 0 12 24Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.29 14.3a7.2 7.2 0 0 1 0-4.6v-3.1H1.28a12 12 0 0 0 0 10.8l4.01-3.1Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.94 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.6l4.01 3.1C6.23 6.86 8.88 4.75 12 4.75Z"
                    />
                  </svg>
                  Registrarte con Google
                </button>
              </form>
              <p className="mt-2 text-center text-xs text-ink/50">
                Creamos tu negocio al instante con datos genéricos — los editas después desde
                Configuración.
              </p>
              <div className="my-6 flex items-center gap-3 text-xs text-ink/40">
                <span className="h-px flex-1 bg-sage-dark/25" />o completa el formulario
                <span className="h-px flex-1 bg-sage-dark/25" />
              </div>
            </>
          )}

          <form action={signUpTenantAction} className="space-y-6">
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
