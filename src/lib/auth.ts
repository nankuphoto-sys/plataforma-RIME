import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

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
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? credentials.email : null;
        const password = typeof credentials?.password === "string" ? credentials.password : null;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          include: { locationRoles: true },
        });
        if (!user) return null;

        const isValidPassword = await bcrypt.compare(password, user.passwordHash);
        if (!isValidPassword) return null;

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
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // user.id es opcional en el tipo base de Auth.js (pensado para
        // providers OAuth donde podría faltar transitoriamente) — acá
        // siempre viene seteado porque lo devuelve nuestro propio
        // authorize() de Credentials con el id real de Prisma.
        token.userId = user.id as string;
        token.tenantId = user.tenantId;
        token.locationRoles = user.locationRoles;
        // Sella en el token el `passwordChangedAt` vigente al momento del
        // login — se compara contra el valor actual en cada request
        // siguiente (más abajo) para poder invalidar el token si la
        // contraseña cambió mientras tanto (otro dispositivo, reset por
        // email, o reseteo asistido por un ADMIN/OWNER).
        token.passwordCheckedAt = user.passwordChangedAt.getTime();
        return token;
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
