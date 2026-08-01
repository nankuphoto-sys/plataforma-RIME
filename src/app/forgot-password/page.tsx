import Link from "next/link";
import { requestPasswordResetAction } from "./actions";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-bold">¿Olvidaste tu contraseña?</h1>
      <p className="mt-2 text-sm text-gray-500">
        Escribe tu email y, si tiene una cuenta, te enviamos un link para restablecer tu contraseña.
      </p>

      {sent === "1" ? (
        <p className="mt-6 text-sm text-green-700">
          Si ese correo tiene una cuenta, te enviamos un link para restablecer tu contraseña.
        </p>
      ) : (
        <form action={requestPasswordResetAction} className="mt-6 space-y-4">
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Enviar link de recuperación
          </button>
        </form>
      )}

      <p className="mt-6 text-sm text-gray-500">
        <Link href="/login" className="underline">
          Volver a iniciar sesión
        </Link>
      </p>
    </main>
  );
}
