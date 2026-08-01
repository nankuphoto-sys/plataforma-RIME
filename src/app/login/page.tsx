import Link from "next/link";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ signup?: string; reset?: string }>;
}) {
  const { signup, reset } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-bold">Iniciar sesión</h1>
      <p className="mt-2 text-sm text-gray-500">
        Ingresa con tu cuenta del equipo para ver la agenda de tu negocio.
      </p>
      {signup === "success" && (
        <p className="mt-4 text-sm text-green-700">Cuenta creada correctamente, inicia sesión.</p>
      )}
      {reset === "success" && (
        <p className="mt-4 text-sm text-green-700">
          Contraseña restablecida correctamente, inicia sesión.
        </p>
      )}
      <LoginForm />
      <p className="mt-4 text-sm text-gray-500">
        <Link href="/forgot-password" className="underline">
          ¿Olvidaste tu contraseña?
        </Link>
      </p>
    </main>
  );
}
