"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { subscribePushAction, unsubscribePushAction } from "@/app/dashboard/[tenantSlug]/notifications/actions";

interface PushNotificationToggleProps {
  tenantSlug: string;
}

type Status = "checking" | "unsupported" | "subscribed" | "unsubscribed" | "denied";

// applicationServerKey del PushManager necesita la clave VAPID pública en
// bytes crudos (Uint8Array), no en el string base64url en el que viene de
// la variable de entorno — esta es la conversión estándar recomendada por
// el spec de Web Push (ver https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe).
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Componente autocontenido para activar/desactivar notificaciones push del
// navegador. A propósito NO se inserta solo en ninguna página del
// dashboard todavía — quien lo use decide dónde (ver el import + JSX de una
// línea documentado junto a este componente).
//
// Flujo "activar": pide permiso del navegador (Notification.requestPermission),
// se suscribe vía PushManager con la clave VAPID pública, y guarda esa
// suscripción con subscribePushAction. Flujo "desactivar": da de baja la
// suscripción en el navegador (PushSubscription.unsubscribe()) y la borra
// del server con unsubscribePushAction.
export function PushNotificationToggle({ tenantSlug }: PushNotificationToggleProps) {
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkCurrentStatus() {
      const supported =
        typeof window !== "undefined" &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;

      if (!supported) {
        if (!cancelled) setStatus("unsupported");
        return;
      }

      if (Notification.permission === "denied") {
        if (!cancelled) setStatus("denied");
        return;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        const existingSubscription = await registration.pushManager.getSubscription();
        if (!cancelled) setStatus(existingSubscription ? "subscribed" : "unsubscribed");
      } catch {
        if (!cancelled) setStatus("unsubscribed");
      }
    }

    checkCurrentStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubscribe() {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        setError("Bloqueaste el permiso de notificaciones en el navegador.");
        return;
      }

      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        setError("Las notificaciones push no están configuradas en este entorno.");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        // Cast a BufferSource: en el lib.dom.d.ts que trae este proyecto,
        // Uint8Array quedó tipado como genérico (Uint8Array<ArrayBufferLike>)
        // y ya no matchea structuralmente con el BufferSource que espera
        // subscribe() — en runtime es exactamente el tipo que la API espera
        // (mismo objeto que produce cualquier ejemplo de la MDN).
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });

      const subscriptionJson = subscription.toJSON();
      if (!subscriptionJson.endpoint || !subscriptionJson.keys?.p256dh || !subscriptionJson.keys?.auth) {
        setError("El navegador no devolvió una suscripción válida.");
        return;
      }

      const result = await subscribePushAction(tenantSlug, {
        endpoint: subscriptionJson.endpoint,
        keys: {
          p256dh: subscriptionJson.keys.p256dh,
          auth: subscriptionJson.keys.auth,
        },
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setStatus("subscribed");
    } catch (err) {
      console.error("Error activando notificaciones push", err);
      setError("No se pudieron activar las notificaciones. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnsubscribe() {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        const result = await unsubscribePushAction(tenantSlug, endpoint);
        if (!result.ok) {
          setError(result.error);
          return;
        }
      }

      setStatus("unsubscribed");
    } catch (err) {
      console.error("Error desactivando notificaciones push", err);
      setError("No se pudieron desactivar las notificaciones. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "unsupported") {
    return (
      <div className="panel mt-4">
        <p className="text-sm text-ink/50">Tu navegador no soporta notificaciones push.</p>
      </div>
    );
  }

  return (
    // .panel mt-4: mismo lenguaje visual que el resto de secciones de
    // account/page.tsx (ver esa página) — así el componente se puede pegar
    // tal cual, sin envolverlo en nada, como una sección más de esa página.
    <div className="panel mt-4">
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-pine/10 text-pine-dark"
          aria-hidden
        >
          {status === "subscribed" ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
        </span>
        <p className="section-title text-sm">Notificaciones push</p>
      </div>

      <p className="mt-3 text-sm text-ink/60">
        Recibe avisos directo en tu navegador o celular, incluso con la pestaña cerrada.
      </p>

      {error && <p className="msg-error mt-2">{error}</p>}
      {status === "denied" && !error && (
        <p className="msg-error mt-2">
          Bloqueaste el permiso de notificaciones para este sitio. Habilítalo desde la configuración
          del navegador para poder activarlas.
        </p>
      )}

      <div className="mt-4">
        {status === "subscribed" ? (
          <button type="button" onClick={handleUnsubscribe} disabled={busy} className="btn-secondary">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellOff className="h-4 w-4" />}
            Desactivar notificaciones
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubscribe}
            disabled={busy || status === "denied" || status === "checking"}
            className="btn-primary"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
            Activar notificaciones
          </button>
        )}
      </div>
    </div>
  );
}
