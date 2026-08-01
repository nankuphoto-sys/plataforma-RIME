"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
