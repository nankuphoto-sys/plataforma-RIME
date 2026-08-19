"use client";

import { useEffect } from "react";

// Registra public/sw.js apenas monta el root layout. No renderiza nada — es
// puro efecto secundario, mismo patrón que otros componentes "de infra"
// (ver AnimatedNumber.tsx para el mismo estilo de useEffect client-only,
// aunque ese sí pinta algo).
//
// Chequeo de soporte porque no todos los navegadores tienen Service Worker
// (ej. algunos WebViews embebidos) — sin el chequeo, esos navegadores
// tirarían un error en consola en cada carga sin ningún beneficio.
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Error registrando el service worker", error);
    });
  }, []);

  return null;
}
