import Link from "next/link";
import { resetPasswordAction } from "./actions";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  if (!token) {
    return (
      <main className="auth-shell">
        <div className="w-full max-w-sm">
          <Link href="/" className="auth-brand transition-opacity hover:opacity-80">
            <span className="auth-brand-mark">R</span>
            <span className="font-display text-lg font-semibold text-paper">RIME</span>
          </Link>
          <div className="auth-card">
            <h1 className="page-title text-2xl">Link inválido</h1>
            <p className="page-subtitle">
              Este link de recuperación no es válido. Pedí uno nuevo desde{" "}
              <Link href="/forgot-password" className="text-pine underline-offset-2 hover:underline">
                ¿Olvidaste tu contraseña?
              </Link>
              .
            </p>
          </div>
        </div>
      </main>
    );
  }

  const errorMessage =
    error === "token-invalido"
      ? "Este link ya no es válido — puede haber expirado o ya haberse usado. Pedí uno nuevo."
      : error;

  return (
    <main className="auth-shell">
      <div className="w-full max-w-sm">
        <Link href="/" className="auth-brand transition-opacity hover:opacity-80">
          <span className="auth-brand-mark">R</span>
          <span className="font-display text-lg font-semibold text-paper">RIME</span>
        </Link>

        <div className="auth-card">
          <h1 className="page-title text-2xl">Elegí una nueva contraseña</h1>
          <p className="page-subtitle">Este link expira 1 hora después de haberlo pedido.</p>

          <form action={resetPasswordAction.bind(null, token)} className="mt-6 space-y-4">
            {errorMessage && <p className="msg-error">{errorMessage}</p>}

            <div>
              <label htmlFor="password" className="field-label">
                Nueva contraseña
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
              <label htmlFor="passwordConfirmation" className="field-label">
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

            <button type="submit" className="btn-primary w-full">
              Restablecer contraseña
            </button>
          </form>

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
