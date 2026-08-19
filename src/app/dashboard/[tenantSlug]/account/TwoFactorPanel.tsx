"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, ShieldCheck, ShieldOff } from "lucide-react";
import {
  confirmTwoFactorSetupAction,
  disableTwoFactorAction,
  startTwoFactorSetupAction,
} from "./actions";

interface TwoFactorPanelProps {
  tenantSlug: string;
  initialEnabled: boolean;
}

type Step =
  | { name: "idle" }
  | { name: "settingUp"; qrCodeDataUrl: string; secret: string }
  | { name: "backupCodes"; codes: string[] };

// Flujo completo de activación/desactivación de 2FA embebido en un solo
// componente cliente (a diferencia de DeleteAccountPanel, acá SÍ hace falta
// manejar varios pasos con datos que solo existen del lado del servidor por
// un instante — el secreto en claro y los backup codes en claro nunca se
// vuelven a poder pedir después de esta sesión de componente).
export function TwoFactorPanel({ tenantSlug, initialEnabled }: TwoFactorPanelProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [step, setStep] = useState<Step>({ name: "idle" });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleStartSetup() {
    setError(null);
    startTransition(async () => {
      const result = await startTwoFactorSetupAction(tenantSlug);
      if (result.ok) {
        setStep({ name: "settingUp", qrCodeDataUrl: result.qrCodeDataUrl, secret: result.secret });
        setCode("");
      } else {
        setError(result.error);
      }
    });
  }

  function handleConfirmSetup(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await confirmTwoFactorSetupAction(tenantSlug, code);
      if (result.ok) {
        setStep({ name: "backupCodes", codes: result.backupCodes });
        setEnabled(true);
        setCode("");
      } else {
        setError(result.error);
      }
    });
  }

  function handleDisable(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await disableTwoFactorAction(tenantSlug, code);
      if (result.ok) {
        setEnabled(false);
        setStep({ name: "idle" });
        setCode("");
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="panel mt-4">
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-pine/10 text-pine-dark"
          aria-hidden
        >
          <ShieldCheck className="h-4 w-4" />
        </span>
        <p className="section-title text-sm">Verificación en dos pasos</p>
        {enabled && step.name !== "backupCodes" && <span className="badge badge-pine ml-auto">Activa</span>}
      </div>

      {step.name === "idle" && !enabled && (
        <>
          <p className="mt-3 text-sm text-ink/60">
            Agrega una capa extra de seguridad: además de tu contraseña, vas a necesitar un código de
            tu app autenticadora (Google Authenticator, Authy, etc.) para iniciar sesión.
          </p>
          {error && <p className="msg-error mt-3">{error}</p>}
          <button type="button" onClick={handleStartSetup} disabled={isPending} className="btn-primary mt-4">
            <ShieldCheck className="h-4 w-4" />
            {isPending ? "Generando…" : "Activar verificación en dos pasos"}
          </button>
        </>
      )}

      {step.name === "settingUp" && (
        <div className="mt-4 space-y-4">
          <ol className="list-decimal space-y-2 pl-4 text-sm text-ink/70">
            <li>Escanea este código QR con tu app autenticadora.</li>
            <li>O ingresa este código manualmente: {" "}
              <code className="data-mono rounded bg-sage/40 px-1.5 py-0.5 text-xs">{step.secret}</code>
            </li>
            <li>Escribe el código de 6 dígitos que te muestra la app para confirmar.</li>
          </ol>

          {/* eslint-disable-next-line @next/next/no-img-element -- data URI (QR generado en el server con qrcode), no sirve next/image */}
          <img
            src={step.qrCodeDataUrl}
            alt="Código QR para configurar la verificación en dos pasos"
            width={200}
            height={200}
            className="rounded-lg border border-sage-dark/40"
          />

          <form onSubmit={handleConfirmSetup} className="space-y-3">
            <div>
              <label htmlFor="setupCode" className="field-label">
                Código de 6 dígitos
              </label>
              <input
                id="setupCode"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                className="field-input max-w-[10rem]"
              />
            </div>

            {error && <p className="msg-error">{error}</p>}

            <div className="flex gap-2">
              <button type="submit" disabled={isPending || !code.trim()} className="btn-primary">
                {isPending ? "Confirmando…" : "Confirmar y activar"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep({ name: "idle" });
                  setError(null);
                  setCode("");
                }}
                className="btn-secondary"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {step.name === "backupCodes" && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2 text-pine-dark">
            <CheckCircle2 className="h-4 w-4" />
            <p className="text-sm font-medium">Verificación en dos pasos activada</p>
          </div>
          <p className="text-sm text-ink/60">
            Guarda estos 8 códigos de respaldo en un lugar seguro. Cada uno sirve una sola vez para
            entrar si pierdes acceso a tu app autenticadora — <strong>no se vuelven a mostrar</strong>{" "}
            después de esto.
          </p>
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-sage-dark/40 bg-paper p-3">
            {step.codes.map((backupCode) => (
              <code key={backupCode} className="data-mono text-sm text-ink">
                {backupCode}
              </code>
            ))}
          </div>
          <button type="button" onClick={() => setStep({ name: "idle" })} className="btn-primary">
            Ya los guardé
          </button>
        </div>
      )}

      {step.name === "idle" && enabled && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-ink/60">
            Tu cuenta está protegida con verificación en dos pasos. Para desactivarla, confirma con un
            código de tu app autenticadora o uno de tus backup codes.
          </p>
          <form onSubmit={handleDisable} className="space-y-3">
            <div>
              <label htmlFor="disableCode" className="field-label">
                Código de verificación
              </label>
              <input
                id="disableCode"
                type="text"
                inputMode="text"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                className="field-input max-w-[12rem]"
              />
            </div>
            {error && <p className="msg-error">{error}</p>}
            <button type="submit" disabled={isPending || !code.trim()} className="btn-danger">
              <ShieldOff className="h-4 w-4" />
              {isPending ? "Desactivando…" : "Desactivar verificación en dos pasos"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
