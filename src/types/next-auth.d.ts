import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

// Aumenta los tipos de Auth.js con los campos propios de la plataforma
// (tenantId y los StaffLocationRole del usuario) para poder usarlos en la
// UI sin queries extra. Esto es solo para UI: las mutaciones siempre
// re-verifican permisos contra la base de datos (ver src/lib/authorization.ts).
declare module "next-auth" {
  interface User {
    tenantId: string;
    locationRoles: { locationId: string; role: Role }[];
    // Solo se usa dentro del callback `jwt` (ver src/lib/auth.ts) para sellar
    // en el token el momento de la contraseña vigente al momento del login —
    // nunca llega al cliente vía `session`.
    passwordChangedAt: Date;
  }

  interface Session {
    user: {
      id: string;
      tenantId: string;
      locationRoles: { locationId: string; role: Role }[];
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    tenantId: string;
    locationRoles: { locationId: string; role: Role }[];
    // Epoch ms de `User.passwordChangedAt` al momento de emitir este token —
    // si la contraseña cambió después, el token se invalida (ver auth.ts).
    passwordCheckedAt: number;
  }
}
