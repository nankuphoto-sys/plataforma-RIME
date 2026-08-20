import Link from "next/link";
import { isGoogleAuthEnabled } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

// Mensajes para los códigos de error que Auth.js agrega como `?error=` al
// redirigir de vuelta acá después de un signIn("google") fallido (ver
// signInWithGoogleAction en actions.ts — usa el redirect default, no
// redirect: false, así que cualquier error de ahí vuelve como query param en
// vez de como valor de retorno). AccessDenied es el código que emite Auth.js
// cuando el callback `signIn` de src/lib/auth.ts devuelve `false` (el email
// de Google no existe todavía como User en RIME). OAuthAccountNotLinked es
// el que emite el propio núcleo de Auth.js cuando el email SÍ existe pero
// como cuenta de Credentials, y no hay allowDangerousEmailAccountLinking
// (a propósito, ver el comentario junto a isGoogleAuthEnabled) — mismo caso,
// mensaje distinto porque acá sí puede resolverlo solo con su contraseña.
const GOOGLE_LOGIN_ERROR_MESSAGES: Record<string, string> = {
  OAuthAccountNotLinked:
    "Ya existe una cuenta con este email. Inicia sesión con tu contraseña — no la vinculamos automáticamente por seguridad.",
  AccessDenied:
    "Ese email no tiene una cuenta en RIME todavía. Pide que te inviten al equipo, o regístrate.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ signup?: string; reset?: string; error?: string }>;
}) {
  const { signup, reset, error } = await searchParams;
  const googleError = error ? GOOGLE_LOGIN_ERROR_MESSAGES[error] : null;

  return (
    <main className="auth-shell">
      <div className="w-full max-w-sm">
        <Link href="/" className="auth-brand transition-opacity hover:opacity-80">
          <span className="auth-brand-mark">R</span>
          <span className="font-display text-lg font-semibold text-paper">RIME</span>
        </Link>

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
          {googleError && <p className="msg-error mt-4">{googleError}</p>}
          <LoginForm googleEnabled={isGoogleAuthEnabled} />
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
