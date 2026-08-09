import Link from "next/link";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ signup?: string; reset?: string }>;
}) {
  const { signup, reset } = await searchParams;

  return (
    <main className="auth-shell">
      <div className="w-full max-w-sm">
        <div className="auth-brand">
          <span className="auth-brand-mark">R</span>
          <span className="font-display text-lg font-semibold text-ink">RIME</span>
        </div>

        <div className="auth-card">
          <h1 className="page-title text-2xl">Iniciar sesión</h1>
          <p className="page-subtitle">
            Ingresa con tu cuenta del equipo para ver la agenda de tu negocio.
          </p>
          {signup === "success" && (
            <p className="msg-success mt-4">Cuenta creada correctamente, inicia sesión.</p>
          )}
          {reset === "success" && (
            <p className="msg-success mt-4">
              Contraseña restablecida correctamente, inicia sesión.
            </p>
          )}
          <LoginForm />
          <p className="mt-5 text-center text-sm text-ink/50">
            <Link href="/forgot-password" className="text-pine underline-offset-2 hover:underline">
              ¿Olvidaste tu contraseña?
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
