"use server";

import { AuthError, CredentialsSignin } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClientIp, isLoginRateLimited, recordLoginAttempt } from "@/lib/rateLimit";

export interface LoginResult {
  ok: boolean;
  error?: string;
  // true cuando la password fue correcta pero el usuario tiene 2FA activo y
  // falta (o fue inválido) el código — LoginForm usa esto para mostrar el
  // segundo paso en vez del error genérico de credenciales.
  needsTwoFactor?: boolean;
}

export async function loginAction(formData: FormData): Promise<LoginResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const totpCode = String(formData.get("totpCode") ?? "").trim();

  if (!email || !password) {
    return { ok: false, error: "Email y contraseña son obligatorios." };
  }

  // Rate-limit por IP: sin esto, un password se podía probar sin límite
  // contra cualquier email conocido, a la velocidad que bcrypt.compare lo
  // permitiera — mismo mecanismo que ya usa forgot-password. El paso 2 de
  // 2FA vuelve a pasar por acá (es otro intento de login), así que también
  // queda protegido contra fuerza bruta del código de 6 dígitos.
  const ip = await getClientIp();
  if (await isLoginRateLimited(ip)) {
    return { ok: false, error: "Demasiados intentos. Espera unos minutos e intenta de nuevo." };
  }
  await recordLoginAttempt(ip);

  try {
    // redirect: false para poder decidir nosotros a qué tenant redirigir
    // según el usuario autenticado, en vez del redirect genérico de Auth.js.
    await signIn("credentials", { email, password, totpCode, redirect: false });
  } catch (err) {
    // CredentialsSignin.code es lo único que sobrevive del error original
    // que tira authorize() (ver TwoFactorRequiredError/TwoFactorInvalidError
    // en src/lib/auth.ts) — el resto del objeto lo reconstruye Auth.js.
    if (err instanceof CredentialsSignin) {
      if (err.code === "two_factor_required") {
        return {
          ok: false,
          needsTwoFactor: true,
          error: "Ingresa el código de tu app autenticadora para continuar.",
        };
      }
      if (err.code === "two_factor_invalid") {
        return {
          ok: false,
          needsTwoFactor: true,
          error: "Código incorrecto. Intenta de nuevo.",
        };
      }
    }
    if (err instanceof AuthError) {
      return { ok: false, error: "Email o contraseña incorrectos." };
    }
    throw err;
  }

  const user = await prisma.user.findUnique({ where: { email }, include: { tenant: true } });
  if (!user) {
    return { ok: false, error: "Email o contraseña incorrectos." };
  }

  redirect(`/dashboard/${user.tenant.slug}`);
}

// Botón "Continuar con Google" en /login — solo se renderiza si
// isGoogleAuthEnabled (ver src/lib/auth.ts) es true. signIn("google") ya
// redirige por su cuenta (comportamiento default, a diferencia de
// loginAction que usa redirect: false para Credentials), así que esta acción
// nunca necesita devolver nada.
export async function signInWithGoogleAction(): Promise<void> {
  await signIn("google");
}
