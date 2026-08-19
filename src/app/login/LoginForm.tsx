"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { loginAction, signInWithGoogleAction } from "./actions";

interface LoginFormProps {
  googleEnabled: boolean;
}

export function LoginForm({ googleEnabled }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  // Password ya validada, pero el usuario tiene 2FA activo -> paso 2.
  const [needsTwoFactor, setNeedsTwoFactor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submitCredentials(code?: string) {
    setError(null);

    const formData = new FormData();
    formData.set("email", email);
    formData.set("password", password);
    if (code) formData.set("totpCode", code);

    startTransition(async () => {
      const result = await loginAction(formData);
      // Si el login fue exitoso, loginAction ya redirigió y esta línea no
      // se alcanza.
      if (!result.ok) {
        setError(result.error ?? "No se pudo iniciar sesión.");
        setNeedsTwoFactor(Boolean(result.needsTwoFactor));
      }
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    submitCredentials();
  }

  function handleVerifyTwoFactor(event: React.FormEvent) {
    event.preventDefault();
    submitCredentials(totpCode);
  }

  if (needsTwoFactor) {
    return (
      <form onSubmit={handleVerifyTwoFactor} className="mt-6 space-y-4">
        <div className="flex items-center gap-2 text-sm text-ink/70">
          <ShieldCheck className="h-4 w-4 text-pine" aria-hidden />
          Verificación en dos pasos
        </div>
        <div>
          <label htmlFor="totpCode" className="field-label">
            Código de tu app autenticadora
          </label>
          <input
            id="totpCode"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value)}
            placeholder="123456"
            className="field-input"
          />
          <p className="mt-1 text-xs text-ink/45">
            También puedes usar uno de tus códigos de respaldo.
          </p>
        </div>

        {error && <p className="msg-error">{error}</p>}

        <button type="submit" disabled={isPending || !totpCode.trim()} className="btn-primary w-full">
          {isPending ? "Verificando…" : "Verificar"}
        </button>
        <button
          type="button"
          onClick={() => {
            setNeedsTwoFactor(false);
            setTotpCode("");
            setError(null);
          }}
          className="w-full text-center text-sm text-ink/50 underline-offset-2 hover:underline"
        >
          Volver
        </button>
      </form>
    );
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="field-label">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field-input"
          />
        </div>
        <div>
          <label htmlFor="password" className="field-label">
            Contraseña
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field-input pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-ink/40 hover:text-ink/70"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {error && <p className="msg-error">{error}</p>}

        <button type="submit" disabled={isPending} className="btn-primary w-full">
          {isPending ? "Ingresando…" : "Ingresar"}
        </button>
      </form>

      {googleEnabled && (
        <>
          <div className="my-4 flex items-center gap-3 text-xs text-ink/40">
            <span className="h-px flex-1 bg-sage-dark/25" />
            o
            <span className="h-px flex-1 bg-sage-dark/25" />
          </div>
          <form action={signInWithGoogleAction}>
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-md border border-sage-dark/30 bg-paper px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-sage/20"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="#4285F4"
                  d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.82Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.07 7.94-2.91l-3.88-3c-1.08.72-2.46 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.94H1.28v3.1A12 12 0 0 0 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.29 14.3a7.2 7.2 0 0 1 0-4.6v-3.1H1.28a12 12 0 0 0 0 10.8l4.01-3.1Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.94 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.6l4.01 3.1C6.23 6.86 8.88 4.75 12 4.75Z"
                />
              </svg>
              Continuar con Google
            </button>
          </form>
        </>
      )}
    </>
  );
}
