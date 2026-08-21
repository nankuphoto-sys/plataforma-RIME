import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { decryptField } from "@/lib/crypto";
import { consumeBackupCode, verifyTotpCode } from "@/lib/twoFactor";
import { provisionTenantForOAuthUser } from "@/lib/tenantProvisioning";
import { logError } from "@/lib/errorLog";

// Errores distinguibles que puede tirar authorize() cuando el usuario tiene
// 2FA activo (ver el bloque más abajo). CredentialsSignin es la única clase
// de Auth.js pensada para esto: si se tira acá adentro, signIn(..., {
// redirect: false }) la vuelve a lanzar tal cual hacia quien la llamó (ver
// src/app/login/actions.ts) en vez de tragársela — el campo `code` (no el
// mensaje, que Auth.js pisa) es lo que loginAction usa para distinguir "hace
// falta el código 2FA" de "usuario o contraseña incorrectos".
export class TwoFactorRequiredError extends CredentialsSignin {
  code = "two_factor_required";
}
export class TwoFactorInvalidError extends CredentialsSignin {
  code = "two_factor_invalid";
}

// Google solo se agrega al array de providers si hay credenciales reales en
// el entorno — hoy están vacías a propósito (el dueño las va a completar más
// adelante). Sin esto, next-auth explota al arrancar si el provider está
// declarado sin clientId/clientSecret. isGoogleAuthEnabled se reexporta para
// que el login (Server Component) sepa si debe mostrar el botón "Continuar
// con Google" sin tener que adivinar leyendo el array de providers.
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
export const isGoogleAuthEnabled = Boolean(googleClientId && googleClientSecret);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // El provider de Credentials no soporta sesiones de base de datos en
  // Auth.js — JWT es obligatorio acá.
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
        // Opcional: solo lo manda el segundo paso del login cuando el
        // usuario tiene 2FA activo (código de 6 dígitos de la app
        // autenticadora, o uno de sus backup codes).
        totpCode: { label: "Código de verificación", type: "text" },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? credentials.email : null;
        const password = typeof credentials?.password === "string" ? credentials.password : null;
        const totpCode = typeof credentials?.totpCode === "string" ? credentials.totpCode.trim() : "";
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          include: { locationRoles: true },
        });
        // passwordHash es null en cuentas creadas por "Registrarte con
        // Google" (ver signIn callback más abajo) — esas nunca tienen
        // contraseña, así que Credentials nunca puede autenticarlas.
        if (!user || !user.passwordHash) return null;

        const isValidPassword = await bcrypt.compare(password, user.passwordHash);
        if (!isValidPassword) return null;

        if (user.twoFactorEnabled) {
          if (!totpCode) {
            // Password correcta pero todavía no llegó el segundo factor —
            // loginAction usa esto para mostrarle al usuario el paso 2 en
            // vez del error genérico "usuario o contraseña incorrectos".
            throw new TwoFactorRequiredError();
          }

          const secret = user.twoFactorSecret ? decryptField(user.twoFactorSecret) : null;
          const isValidTotp = secret ? await verifyTotpCode(secret, totpCode) : false;

          if (!isValidTotp) {
            const hashedBackupCodes: string[] = user.twoFactorBackupCodes
              ? JSON.parse(user.twoFactorBackupCodes)
              : [];
            const remainingCodes = consumeBackupCode(totpCode, hashedBackupCodes);

            if (remainingCodes === null) {
              throw new TwoFactorInvalidError();
            }

            // Backup code de un solo uso: se descarta apenas se valida,
            // nunca vuelve a servir aunque se reenvíe el mismo valor.
            await prisma.user.update({
              where: { id: user.id },
              data: { twoFactorBackupCodes: JSON.stringify(remainingCodes) },
            });
          }
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          tenantId: user.tenantId,
          locationRoles: user.locationRoles.map((role) => ({
            locationId: role.locationId,
            role: role.role,
          })),
          passwordChangedAt: user.passwordChangedAt,
        };
      },
    }),
    // Ver el comentario de isGoogleAuthEnabled arriba: sin credenciales
    // reales, el spread queda vacío y el array de providers no cambia.
    //
    // allowDangerousEmailAccountLinking (decisión explícita del dueño,
    // 2026-08-21, tras probarlo en producción): sin esto, Auth.js rechaza
    // con OAuthAccountNotLinked cualquier login por Google cuyo email ya
    // tenga cuenta por Credentials (contraseña) en RIME, sin importar que
    // el email esté verificado por Google. El dueño prefirió la comodidad
    // de entrar directo con Google sobre el riesgo que esto habilita: quien
    // controle esa cuenta de Google (ej. alguien que recupere acceso al
    // Gmail) entra a RIME sin conocer la contraseña ni pasar el 2FA. No es
    // el default seguro de Auth.js — es un trade-off aceptado a propósito.
    ...(googleClientId && googleClientSecret
      ? [
          Google({
            clientId: googleClientId,
            clientSecret: googleClientSecret,
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
  ],
  callbacks: {
    // Solo relevante para el provider de Google (Credentials no pasa por
    // acá con account.provider !== "credentials" — Auth.js llama a este
    // callback para todos los providers, pero para Credentials siempre
    // devuelve true sin más chequeos, el trabajo pesado ya lo hizo
    // authorize()).
    //
    // El modelo User de este proyecto es tenant-scoped (tenantId NOT
    // NULL) — Auth.js, si este callback devuelve true y no existe todavía
    // ni User ni Account para este login, intenta crear el User él mismo
    // vía adapter.createUser() con el shape default de OAuth (name/email/
    // image), sin tenantId, lo que rompería contra el NOT NULL. Por eso
    // NUNCA se deja que Auth.js cree el User: si el email no existe
    // todavía, se aprovisiona acá mismo un negocio de prueba completo
    // (Tenant + Location + User + StaffLocationRole OWNER) DENTRO de este
    // callback, más el Account (mismo provider/providerAccountId que
    // Auth.js va a buscar después en handleLoginOrRegister vía
    // getUserByAccount) — así, cuando Auth.js sigue su flujo normal
    // después de este callback, encuentra el Account ya vinculado y solo
    // abre sesión, sin volver a intentar crear nada. Verificado leyendo
    // node_modules/@auth/core/lib/actions/callback/{index,handle-login}.js
    // el 2026-08-20 para confirmar el orden exacto de estas llamadas.
    //
    // Nombre/rubro/plan son genéricos a propósito — el dueño los edita
    // después desde Configuración. Alcance elegido por el usuario en vez
    // de armar un formulario de dos pasos (Google -> completar datos ->
    // crear cuenta), que hubiera sido bastante más grande de construir.
    //
    // Si el email SÍ existe ya (con o sin Account de Google vinculada),
    // no se toca nada acá — Auth.js sigue su flujo normal, que YA rechaza
    // con OAuthAccountNotLinked un email que existe como Credentials sin
    // vincular (comportamiento previo, sin cambios).
    async signIn({ user, account }) {
      // try/catch con logError (no solo para diagnóstico puntual, queda
      // como monitoreo permanente de este flujo — mismo criterio que los
      // webhooks de pago): si algo falla acá, queda registrado en ErrorLog
      // antes de relanzar el error tal cual.
      try {
        if (account?.provider && account.provider !== "credentials") {
          const email = user.email ?? "";
          if (!email) return false;

          const existing = await prisma.user.findUnique({ where: { email } });
          if (!existing && account.providerAccountId) {
            await provisionTenantForOAuthUser({
              email,
              name: user.name?.trim() || email.split("@")[0],
              image: typeof user.image === "string" ? user.image : null,
              account: {
                type: account.type,
                provider: account.provider,
                providerAccountId: account.providerAccountId,
                access_token: typeof account.access_token === "string" ? account.access_token : null,
                refresh_token: typeof account.refresh_token === "string" ? account.refresh_token : null,
                expires_at: typeof account.expires_at === "number" ? account.expires_at : null,
                token_type: typeof account.token_type === "string" ? account.token_type : null,
                scope: typeof account.scope === "string" ? account.scope : null,
                id_token: typeof account.id_token === "string" ? account.id_token : null,
                session_state:
                  typeof account.session_state === "string" ? account.session_state : null,
              },
            });
          }
        }
        return true;
      } catch (error) {
        await logError(error, { where: "auth.signIn", provider: account?.provider ?? null });
        throw error;
      }
    },
    async jwt({ token, user, account }) {
      if (user) {
        // Mismo criterio que el try/catch del signIn callback de arriba:
        // monitoreo permanente de este flujo vía logError, no diagnóstico
        // puntual.
        try {
          // Login por Credentials ya trae tenantId/locationRoles/
          // passwordChangedAt resueltos en el authorize() de arriba. Login por
          // Google (OAuth) no los trae — el profile() default del provider
          // solo devuelve id/name/email/image — hay que resolverlos acá
          // contra la base por email (el callback signIn de arriba ya
          // garantiza que solo llega acá un email que YA existe como User).
          let tenantId = user.tenantId;
          let locationRoles = user.locationRoles;
          let passwordChangedAt = user.passwordChangedAt;

          if (account?.provider && account.provider !== "credentials") {
            const dbUser = await prisma.user.findUnique({
              where: { email: user.email ?? "" },
              include: { locationRoles: true },
            });
            if (!dbUser) return null;
            tenantId = dbUser.tenantId;
            locationRoles = dbUser.locationRoles.map((role) => ({
              locationId: role.locationId,
              role: role.role,
            }));
            passwordChangedAt = dbUser.passwordChangedAt;
          }

          // Auth.js arma el token inicial con `picture: user.image` ANTES de
          // que este callback corra. Para un login por Google, `user.image`
          // es el valor ya guardado en User.image, que puede tener la foto
          // de perfil como base64 directo en la columna (stopgap de
          // src/lib/profileImage.ts, marcado ahí mismo como no apto para
          // casos grandes). Un JWT con esa foto adentro puede pesar varios
          // MB y no entra en las cookies chunked de Auth.js dentro del
          // límite de headers de la plataforma — causó un 500
          // (FUNCTION_INVOCATION_FAILED) en producción, ver historial de
          // este archivo. `session.user.image` no se usa en ningún lado de
          // la UI (la foto de perfil se lee directo de la base cuando hace
          // falta), así que sacarlo del token es gratis.
          delete token.picture;

          // user.id es opcional en el tipo base de Auth.js (pensado para
          // providers OAuth donde podría faltar transitoriamente) — acá
          // siempre viene seteado porque lo devuelve nuestro propio
          // authorize() de Credentials con el id real de Prisma, o el adapter
          // de Prisma con el id real del User existente para Google.
          token.userId = user.id as string;
          token.tenantId = tenantId;
          token.locationRoles = locationRoles;
          // Sella en el token el `passwordChangedAt` vigente al momento del
          // login — se compara contra el valor actual en cada request
          // siguiente (más abajo) para poder invalidar el token si la
          // contraseña cambió mientras tanto (otro dispositivo, reset por
          // email, o reseteo asistido por un ADMIN/OWNER).
          token.passwordCheckedAt = passwordChangedAt.getTime();
          return token;
        } catch (error) {
          await logError(error, { where: "auth.jwt.firstLogin", provider: account?.provider ?? null });
          throw error;
        }
      }

      // Requests siguientes (sin `user`, o sea no es el login en sí):
      // revalidar contra la base que la contraseña no haya cambiado después
      // de emitido este token. Costo: una consulta extra a la base en cada
      // request que llama a `auth()` — aceptado a propósito para cerrar el
      // hueco de "cambiar contraseña no cierra sesiones activas en otros
      // dispositivos" (limitación conocida de session: { strategy: "jwt" }).
      const userId = token.userId as string | undefined;
      if (!userId) return null; // token sin este campo (formato viejo/corrupto) -> forzar re-login

      // Esta consulta corre en TODO auth() de todo request, incluidas las
      // Server Actions — un hipo transitorio de conexión acá (encontrado en
      // sesión de verificación: Neon cerrando la conexión bajo carga) no
      // debe destruir una sesión por lo demás válida. Fail-open: si la
      // consulta falla, se confía en el token tal cual está en vez de
      // devolver null (que Auth.js interpreta como sesión inválida y
      // desloguea al usuario sin aviso). El costo es la misma ventana que ya
      // existe entre requests (la contraseña pudo cambiar hace un instante),
      // no una ventana nueva — comparado con deslogar gente al azar por
      // errores de red, es el trade-off correcto.
      let currentUser: { passwordChangedAt: Date } | null;
      try {
        currentUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { passwordChangedAt: true },
        });
      } catch (error) {
        console.error("[auth.jwt] No se pudo revalidar passwordChangedAt, se conserva la sesión:", error);
        return token;
      }
      if (!currentUser) return null; // usuario borrado/desactivado entre requests

      const passwordCheckedAt = (token.passwordCheckedAt as number | undefined) ?? 0;
      if (currentUser.passwordChangedAt.getTime() > passwordCheckedAt) {
        // La contraseña cambió después de emitido este token -> se devuelve
        // `null`, que Auth.js interpreta como sesión inválida (auth()
        // devuelve null en el próximo request, los guards redirigen a
        // /login como si nunca hubiera habido sesión).
        return null;
      }

      return token;
    },
    async session({ session, token }) {
      // `token` viene tipado como Record<string, unknown> (ver
      // src/types/next-auth.d.ts) — sabemos que trae estos campos porque los
      // seteamos nosotros mismos en el callback `jwt` de arriba.
      session.user.id = token.userId as string;
      session.user.tenantId = token.tenantId as string;
      session.user.locationRoles = token.locationRoles as { locationId: string; role: Role }[];
      return session;
    },
  },
});
