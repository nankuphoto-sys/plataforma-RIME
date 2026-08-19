import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

const WINDOW_MINUTES = 15;
const MAX_ATTEMPTS_PER_WINDOW = 5;

// El cooldown de 2 minutos por usuario en requestPasswordResetAction ya
// evita que se reenvíe el mismo link a repetición, pero no frena a alguien
// probando muchos emails distintos desde la misma IP (enumeración /
// saturación de la cola de envío de Resend). Esta capa es independiente y
// se suma a esa, no la reemplaza.
export async function getClientIp(): Promise<string> {
  const headersList = await headers();
  // `x-forwarded-for` puede traer una cadena "cliente, proxy1, proxy2" —
  // el primero es el IP original. En dev local (sin proxy) no viene ninguno
  // de los dos headers, así que cae en "unknown" (todas las requests locales
  // comparten el mismo cupo, que alcanza de sobra para probar el flujo).
  const forwardedFor = headersList.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();
  return headersList.get("x-real-ip") ?? "unknown";
}

// true si esta IP ya alcanzó el máximo de intentos de reseteo de contraseña
// en la ventana de tiempo — la llamada que dispara esto NO se registra como
// un intento nuevo (ver requestPasswordResetAction: solo se llama a
// recordPasswordResetAttempt después de confirmar que no está limitada).
export async function isPasswordResetRateLimited(ip: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);

  // Limpieza perezosa: no hay cron dedicado para esta tabla (a diferencia de
  // PasswordResetToken, que expira pero nunca se borra) — se borran acá los
  // intentos vencidos de esta misma IP para que la tabla no crezca sin
  // límite en una IP que pega mucho. No es exhaustivo (otras IPs solo se
  // limpian cuando ellas mismas vuelven a pedir un reset) pero alcanza para
  // el volumen esperado de este endpoint.
  await prisma.passwordResetAttempt.deleteMany({
    where: { ip, createdAt: { lt: windowStart } },
  });

  const attemptsInWindow = await prisma.passwordResetAttempt.count({
    where: { ip, createdAt: { gt: windowStart } },
  });

  return attemptsInWindow >= MAX_ATTEMPTS_PER_WINDOW;
}

export async function recordPasswordResetAttempt(ip: string): Promise<void> {
  await prisma.passwordResetAttempt.create({ data: { ip } });
}

// Mismo mecanismo que el rate-limit de reseteo de contraseña, tabla aparte
// (LoginAttempt) — loginAction no tenía ninguna capa de throttling antes de
// esto: bcrypt.compare corría sin límite contra cualquier password
// enviado, para cualquier email conocido.
export async function isLoginRateLimited(ip: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);

  await prisma.loginAttempt.deleteMany({
    where: { ip, createdAt: { lt: windowStart } },
  });

  const attemptsInWindow = await prisma.loginAttempt.count({
    where: { ip, createdAt: { gt: windowStart } },
  });

  return attemptsInWindow >= MAX_ATTEMPTS_PER_WINDOW;
}

export async function recordLoginAttempt(ip: string): Promise<void> {
  await prisma.loginAttempt.create({ data: { ip } });
}
