import { Camera, KeyRound, Trash2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireDashboardAccess } from "@/lib/auth-guards";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { MAX_PROFILE_IMAGE_LABEL } from "@/lib/profileImage";
import { changePasswordAction, removeProfilePhotoAction } from "./actions";
import { ProfilePhotoUploadForm } from "./ProfilePhotoUploadForm";

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default async function AccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ error?: string; saved?: string; photoError?: string; savedPhoto?: string }>;
}) {
  const { tenantSlug } = await params;
  const { error, saved, photoError, savedPhoto } = await searchParams;
  const { session } = await requireDashboardAccess(tenantSlug);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { name: true, email: true, image: true },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="page-title">Mi cuenta</h1>
      <p className="page-subtitle">{session.user.email}</p>

      <div className="panel mt-6">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-pine/10 text-pine-dark"
            aria-hidden
          >
            <Camera className="h-4 w-4" />
          </span>
          <p className="section-title text-sm">Foto de perfil</p>
        </div>

        {photoError && <p className="msg-error mt-3">{photoError}</p>}
        {savedPhoto && !photoError && <p className="msg-success mt-3">Foto actualizada.</p>}

        <div className="mt-4 flex items-center gap-4">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URI, no sirve next/image
            <img
              src={user.image}
              alt="Foto de perfil"
              className="h-24 w-24 rounded-full object-cover ring-1 ring-sage-dark/40"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-pine/15 text-2xl font-semibold text-pine-dark">
              {getInitials(user.name)}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <ProfilePhotoUploadForm tenantSlug={tenantSlug} />
            {user.image && (
              <form action={removeProfilePhotoAction.bind(null, tenantSlug)}>
                <SubmitButton
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  pendingLabel="Quitando…"
                  className="group inline-flex items-center gap-1 text-xs text-ink/50 underline transition-colors hover:text-berry-dark active:scale-[0.98]"
                >
                  Quitar foto
                </SubmitButton>
              </form>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-ink/40">JPG, PNG o WEBP. Máximo {MAX_PROFILE_IMAGE_LABEL}.</p>
      </div>

      <div className="panel mt-4">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-pine/10 text-pine-dark"
            aria-hidden
          >
            <KeyRound className="h-4 w-4" />
          </span>
          <p className="section-title text-sm">Cambiar contraseña</p>
        </div>

        {error && <p className="msg-error mt-3">{error}</p>}
        {saved && !error && <p className="msg-success mt-3">Contraseña actualizada.</p>}

        <form
          action={changePasswordAction.bind(null, tenantSlug)}
          className="mt-4 space-y-4"
        >
          <div>
            <label className="field-label" htmlFor="currentPassword">
              Contraseña actual
            </label>
            <input
              id="currentPassword"
              name="currentPassword"
              type="password"
              required
              className="field-input"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="newPassword">
              Nueva contraseña
            </label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              required
              minLength={8}
              className="field-input"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="newPasswordConfirmation">
              Confirmar nueva contraseña
            </label>
            <input
              id="newPasswordConfirmation"
              name="newPasswordConfirmation"
              type="password"
              required
              minLength={8}
              className="field-input"
            />
          </div>

          <SubmitButton icon={<KeyRound className="h-4 w-4" />} pendingLabel="Guardando…">
            Guardar contraseña
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
