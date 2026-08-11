import Link from "next/link";
import { requestPasswordResetAction } from "./actions";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;

  return (
    <main className="auth-shell">
      <div className="w-full max-w-sm">
        <div className="auth-brand">
          <span className="auth-brand-mark">R</span>
          <span className="font-display text-lg font-semibold text-paper">RIME</span>
        </div>

        <div className="auth-card">
          <h1 className="page-title text-2xl">¿Olvidaste tu contraseña?</h1>
          <p className="page-subtitle">
            Escribe tu email y, si tiene una cuenta, te enviamos un link para restablecer tu
            contraseña.
          </p>

          {sent === "1" ? (
            <p className="msg-success mt-6">
              Si ese correo tiene una cuenta, te enviamos un link para restablecer tu contraseña.
            </p>
          ) : (
            <form action={requestPasswordResetAction} className="mt-6 space-y-4">
              {error ? <p className="msg-error">{error}</p> : null}
              <div>
                <label htmlFor="email" className="field-label">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="field-input"
                />
              </div>

              <button type="submit" className="btn-primary w-full">
                Enviar link de recuperación
              </button>
            </form>
          )}

          <p className="mt-5 text-center text-sm text-ink/50">
            <Link href="/login" className="text-pine underline-offset-2 hover:underline">
              Volver a iniciar sesión
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
