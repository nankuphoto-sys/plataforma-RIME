"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClientIp, isLoginRateLimited, recordLoginAttempt } from "@/lib/rateLimit";

export interface LoginResult {
  ok: boolean;
  error?: string;
}

export async function loginAction(formData: FormData): Promise<LoginResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { ok: false, error: "Email y contraseña son obligatorios." };
  }

  // Rate-limit por IP: sin esto, un password se podía probar sin límite
  // contra cualquier email conocido, a la velocidad que bcrypt.compare lo
  // permitiera — mismo mecanismo que ya usa forgot-password.
  const ip = await getClientIp();
  if (await isLoginRateLimited(ip)) {
    return { ok: false, error: "Demasiados intentos. Esperá unos minutos e intentá de nuevo." };
  }
  await recordLoginAttempt(ip);

  try {
    // redirect: false para poder decidir nosotros a qué tenant redirigir
    // según el usuario autenticado, en vez del redirect genérico de Auth.js.
    await signIn("credentials", { email, password, redirect: false });
  } catch (err) {
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
