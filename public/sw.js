// Service worker de RIME.
//
// Alcance de este archivo (a propósito, no más que esto):
//   1. Cache de assets estáticos same-origin para que la app cargue más
//      rápido en visitas repetidas (no hay sincronización offline de datos
//      de negocio — citas/clientes/inventario siguen requiriendo red, eso
//      es una feature aparte, mucho más grande, que no es parte de esto).
//   2. Recepción de notificaciones Web Push (evento "push") y manejo del
//      click sobre ellas (evento "notificationclick").
//
// CACHE_VERSION: subir este número (parte del nombre de cache) es la forma
// de invalidar el cache viejo en un deploy — el evento "activate" borra
// cualquier cache cuyo nombre no matchee la versión actual.
const CACHE_VERSION = "rime-static-v1";

// No se precachea una lista fija de archivos hasheados de /_next/static
// (cambian en cada build, precachear nombres de un build viejo solo
// acumularía basura) — en cambio, se cachea "sobre la marcha": cualquier
// GET same-origin exitoso se guarda la primera vez que se pide, y de ahí en
// adelante esa respuesta sirve como fallback si la red falla o está lenta.
self.addEventListener("install", (event) => {
  // No esperar a que se cierren las pestañas viejas: el SW nuevo entra en
  // actividad apenas termina de instalar.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_VERSION)
          .map((name) => caches.delete(name))
      );
      // Tomar control de las pestañas ya abiertas sin esperar a que
      // recarguen — si no, este SW recién controla la próxima navegación.
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Solo GET same-origin: no interceptar POST/PUT (Server Actions viajan
  // por POST) ni pedidos a otros orígenes (ej. APIs externas) — cachear eso
  // sería, en el mejor caso, inútil, y en el peor, un bug de datos viejos.
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  // Navegación (HTML de página): red primero, con fallback a cache si no
  // hay conexión — así el usuario nunca ve una página vieja teniendo
  // internet, pero sigue teniendo algo que mostrar si se cae la red.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(CACHE_VERSION);
          cache.put(request, response.clone());
          return response;
        } catch (error) {
          const cached = await caches.match(request);
          return cached ?? Response.error();
        }
      })()
    );
    return;
  }

  // Resto de assets estáticos (JS/CSS/fuentes/íconos de /_next/static y
  // /public): cache primero, y si no está, ir a la red y guardarlo para la
  // próxima. Estos archivos son inmutables por nombre (hash en el filename
  // de Next.js), así que "cache primero" es seguro — nunca va a quedar
  // stale bajo el mismo nombre.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;

      try {
        const response = await fetch(request);
        // Solo cachear respuestas válidas (evita guardar 404/errores).
        if (response.ok) {
          const cache = await caches.open(CACHE_VERSION);
          cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        return Response.error();
      }
    })()
  );
});

// --- Web Push ---

// El payload viaja como JSON stringificado por sendPushNotification()
// (src/lib/webPush.ts): { title, body, url? }. Si por algún motivo no es
// JSON válido, se muestra igual una notificación genérica en vez de fallar
// silenciosamente sin avisar nada al usuario.
self.addEventListener("push", (event) => {
  let payload = { title: "RIME", body: "Tienes una notificación nueva." };
  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() };
    }
  } catch (error) {
    // payload no era JSON — se muestra el genérico de arriba.
  }

  const { title, body, url } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url: url ?? "/" },
    })
  );
});

// Al clickear la notificación: si ya hay una pestaña de la app abierta en
// esa URL (o en el mismo origen), la enfoca en vez de abrir una pestaña
// duplicada; si no hay ninguna, abre una nueva.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url ?? "/";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const targetAbsoluteUrl = new URL(targetUrl, self.location.origin).href;

      for (const client of allClients) {
        if (client.url === targetAbsoluteUrl && "focus" in client) {
          return client.focus();
        }
      }

      const sameOriginClient = allClients.find((client) => client.url.startsWith(self.location.origin));
      if (sameOriginClient && "navigate" in sameOriginClient && "focus" in sameOriginClient) {
        await sameOriginClient.navigate(targetAbsoluteUrl);
        return sameOriginClient.focus();
      }

      return self.clients.openWindow(targetAbsoluteUrl);
    })()
  );
});
