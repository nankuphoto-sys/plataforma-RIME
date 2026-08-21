import Link from "next/link";
import { isGoogleAuthEnabled } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

// Mensajes para los códigos de error que Auth.js agrega como `?error=` al
// redirigir de vuelta acá después de un signIn("google") fallido (ver
// signInWithGoogleAction en actions.ts — usa el redirect default, no
// redirect: false, así que cualquier error de ahí vuelve como query param en
// vez de como valor de retorno). AccessDenied es el código que emite Auth.js
// cuando el callback `signIn` de src/lib/auth.ts devuelve `false` — hoy solo
// pasa si el perfil de Google no trae email (caso borde, casi nunca).
// OAuthAccountNotLinked ya no puede pasar con Google (se activó
// allowDangerousEmailAccountLinking, ver el comentario junto a
// isGoogleAuthEnabled) pero se deja el mensaje por si algún día se agrega
// otro provider OAuth sin esa opción.
const GOOGLE_LOGIN_ERROR_MESSAGES: Record<string, string> = {
  OAuthAccountNotLinked:
    "Ya existe una cuenta con este email. Inicia sesión con tu contraseña — no la vinculamos automáticamente por seguridad.",
  AccessDenied:
    "No pudimos obtener tu email desde Google. Revisá los permisos de la cuenta e intentá de nuevo.",
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
