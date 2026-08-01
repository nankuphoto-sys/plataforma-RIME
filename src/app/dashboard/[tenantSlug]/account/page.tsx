import { requireDashboardAccess } from "@/lib/auth-guards";
import { changePasswordAction } from "./actions";

export default async function AccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { tenantSlug } = await params;
  const { error, saved } = await searchParams;
  const { session } = await requireDashboardAccess(tenantSlug);

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="page-title">Mi cuenta</h1>
      <p className="page-subtitle">{session.user.email}</p>

      <div className="mt-6 border-t border-sage-dark/30 pt-4">
        <p className="section-title text-sm">Cambiar contraseña</p>

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

          <button type="submit" className="btn-primary">
            Guardar contraseña
          </button>
        </form>
      </div>
    </div>
  );
}
