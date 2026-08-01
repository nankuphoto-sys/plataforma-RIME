import Link from "next/link";
import { resetPasswordAction } from "./actions";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  if (!token) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
        <h1 className="text-2xl font-bold">Link inválido</h1>
        <p className="mt-2 text-sm text-gray-500">
          Este link de recuperación no es válido. Pedí uno nuevo desde{" "}
          <Link href="/forgot-password" className="underline">
            ¿Olvidaste tu contraseña?
          </Link>
          .
        </p>
      </main>
    );
  }

  const errorMessage =
    error === "token-invalido"
      ? "Este link ya no es válido — puede haber expirado o ya haberse usado. Pedí uno nuevo."
      : error;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-bold">Elegí una nueva contraseña</h1>
      <p className="mt-2 text-sm text-gray-500">
        Este link expira 1 hora después de haberlo pedido.
      </p>

      <form action={resetPasswordAction.bind(null, token)} className="mt-6 space-y-4">
        {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">
            Nueva contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="passwordConfirmation" className="block text-sm font-medium text-gray-700">
            Confirmar contraseña
          </label>
          <input
            id="passwordConfirmation"
            name="passwordConfirmation"
            type="password"
            required
            minLength={8}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Restablecer contraseña
        </button>
      </form>

      <p className="mt-6 text-sm text-gray-500">
        <Link href="/login" className="underline">
          Volver a iniciar sesión
        </Link>
      </p>
    </main>
  );
}
