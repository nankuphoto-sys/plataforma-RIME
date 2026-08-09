"use client";

import { useState, useTransition } from "react";
import { loginAction } from "./actions";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("email", email);
    formData.set("password", password);

    startTransition(async () => {
      const result = await loginAction(formData);
      // Si el login fue exitoso, loginAction ya redirigió y esta línea no
      // se alcanza.
      if (!result.ok) {
        setError(result.error ?? "No se pudo iniciar sesión.");
      }
    });
  }

  return (
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
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field-input"
        />
      </div>

      {error && <p className="msg-error">{error}</p>}

      <button type="submit" disabled={isPending} className="btn-primary w-full">
        {isPending ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}
