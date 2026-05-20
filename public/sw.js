const CACHE_NAME = 'gastos-negocio-cache-__BUILD_VERSION__';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/favicon.svg'
];

// Instalar el Service Worker y almacenar en caché archivos clave
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Intentamos cachear lo que podamos. Algunos archivos de src no existen
      // compilados en desarrollo/producción directamente con este nombre, por lo que
      // atrapamos errores en el desarrollo si no encuentra una ruta exacta.
      return Promise.allSettled(
        ASSETS_TO_CACHE.map(asset => {
          return cache.add(asset).catch(err => {
            console.warn(`Error cacheando asset: ${asset}`, err);
          });
        })
      );
    })
  );
  self.skipWaiting();
});

// Activar y limpiar cachés viejos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Interceptar peticiones y servir desde caché si está offline
// Interceptar peticiones y servir con las estrategias de caché correspondientes
self.addEventListener('fetch', (event) => {
  // Solo interceptar peticiones GET locales (evita interceptar llamadas a Supabase o externas)
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  const url = new URL(event.request.url);

  // 1. ESTRATEGIA: Network-First para la navegación / HTML principal
  // Esto garantiza que siempre carguemos el último index.html (que apunta a los nuevos JS/CSS) si hay red.
  if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          // Si falla la red (offline), servimos el index.html desde caché
          return caches.match('/index.html');
        })
    );
    return;
  }

  // 2. ESTRATEGIA: Cache-First para archivos compilados en /assets/ (JS/CSS con hashes)
  // Como tienen hashes únicos de compilación, son inmutables y no cambiarán sin cambiar de nombre.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // 3. ESTRATEGIA: Stale-While-Revalidate para el resto de archivos estáticos (iconos, manifest, etc.)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {/* Ignorar errores de red offline */});

      return cachedResponse || fetchPromise;
    })
  );
});

// Manejar notificaciones push recibidas
self.addEventListener('push', (event) => {
  let data = { 
    title: 'Control de Gastos', 
    body: 'Se ha registrado una nueva actividad en el negocio.' 
  };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { 
        title: 'Control de Gastos', 
        body: event.data.text() 
      };
    }
  }

  const options = {
    body: data.body,
    icon: '/icon.svg',
    badge: '/icon.svg',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '1'
    },
    actions: [
      { action: 'explore', title: 'Ver Gastos' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Manejar clics en las notificaciones
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si la app ya está abierta, hacerle focus
      for (const client of clientList) {
        if (client.url === '/' || client.url.startsWith(self.location.origin)) {
          if ('focus' in client) return client.focus();
        }
      }
      // Si no, abrir una ventana nueva
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});
