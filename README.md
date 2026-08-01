# Plataforma Agenda (scaffold inicial)

Scaffold de una plataforma de agendamiento, CRM y pagos para negocios de salud
y bienestar — pensada como alternativa mejor a AgendaPro. Ver el contexto de
producto completo en `../estudio-agendapro.md` y el plan técnico en
`../plan-tecnico-plataforma.md`.

## Qué incluye este scaffold

- Next.js (App Router) + TypeScript + Tailwind, listo para correr.
- Esquema de base de datos completo en `prisma/schema.prisma`: tenants, sedes,
  usuarios con roles **por sede**, profesionales, servicios, clientes (con
  ficha configurable por vertical vía JSON), citas, pagos y cola de notificaciones.
- Seed de datos de ejemplo (`prisma/seed.ts`).
- Página pública de reservas de ejemplo en `/[tenantSlug]`.
- Endpoint de salud en `/api/health` (valida conexión a la base de datos).
- `CLAUDE.md` con el contexto de producto y convenciones para trabajar con
  Claude Code directamente en VS Code.

## Requisitos

- Node.js 20+
- Docker (para levantar PostgreSQL local) — o una base de datos Postgres ya
  disponible (Neon, Railway, Supabase, etc.)

## Cómo arrancar

```bash
# 1. Instalar dependencias
npm install

# 2. Copiar variables de entorno y completar lo necesario
cp .env.example .env

# 3. Levantar Postgres local (o usa una base de datos en la nube y salta este paso)
docker compose up -d

# 4. Crear las tablas a partir del schema de Prisma
npm run db:migrate

# 5. Cargar datos de ejemplo
npm run db:seed

# 6. Levantar la app
npm run dev
```

Abre `http://localhost:3000` para el panel interno, y
`http://localhost:3000/consultorio-demo` para ver la página pública de reservas
del tenant de ejemplo que crea el seed.

## Credenciales de demo

El seed crea un usuario `OWNER` para probar el login y la agenda interna:

- URL de login: `http://localhost:3000/login`
- Email: `owner@demo.com`
- Contraseña: `demo1234`

Al loguearte redirige a `http://localhost:3000/dashboard/consultorio-demo`
(su tenant). La página pública de reservas (`/consultorio-demo`) sigue sin
requerir login.

## Estructura

```
plataforma-agenda/
├── prisma/
│   ├── schema.prisma      # modelo de datos completo
│   └── seed.ts            # datos de ejemplo
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx               # home (placeholder)
│   │   ├── login/                 # login (email + contraseña, Auth.js)
│   │   ├── (public)/[tenantSlug]/ # página pública de reservas (sin login)
│   │   ├── dashboard/[tenantSlug]/ # agenda interna (protegida)
│   │   └── api/
│   │       ├── auth/[...nextauth]/ # route handler de Auth.js
│   │       └── health/              # healthcheck
│   └── lib/
│       ├── prisma.ts        # cliente de Prisma singleton
│       ├── auth.ts          # config de Auth.js (Credentials + Prisma adapter)
│       ├── auth-guards.ts   # protección de /dashboard/[tenantSlug]
│       └── authorization.ts # lógica pura de permisos por sede
├── CLAUDE.md               # contexto persistente para Claude Code
└── docker-compose.yml      # Postgres local
```

## Cómo seguir con Claude Code en VS Code

1. Abre esta carpeta (`plataforma-agenda/`) en VS Code.
2. Abre la terminal integrada y corre `claude` (o usa la extensión de Claude Code).
3. Claude Code leerá automáticamente `CLAUDE.md` para tener el contexto del
   producto, el stack y las convenciones — no hace falta que se lo repitas.
4. Pide trabajo por fase (ver `CLAUDE.md` → sección "Fases"), por ejemplo:
   - "Implementa el CRUD de citas de la fase 1 usando el modelo `Appointment`."
   - "Agrega autenticación con Clerk y conéctala con `StaffLocationRole`."
   - "Crea la vista de agenda interna por profesional con drag-and-drop."
5. Trabaja en ramas y PRs pequeños por módulo (agenda, CRM, pagos) — rinde
   mejor que pedir features gigantes de una sola vez.

## Próximos pasos sugeridos (fase 1)

- [x] Autenticación: Auth.js v5 (Credentials + `@auth/prisma-adapter`),
      protegiendo `/dashboard/[tenantSlug]` con `StaffLocationRole`.
- [ ] Construir la vista de agenda interna (calendario por profesional/sede).
- [ ] Formulario de reserva pública funcional (hoy solo lista servicios).
- [ ] Cola de recordatorios: worker que lea `NotificationQueue` y dispare
      WhatsApp/email.
