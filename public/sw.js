const CACHE_NAME = 'gastos-negocio-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/src/main.tsx',
  '/src/App.tsx',
  '/src/index.css'
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
self.addEventListener('fetch', (event) => {
  // Solo interceptar peticiones GET locales (evita interceptar llamadas a Supabase)
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Devolvemos el recurso cacheado e intentamos actualizar la caché en segundo plano
        fetch(event.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {/* Silenciar errores de red en segundo plano */});
        
        return cachedResponse;
      }

      return fetch(event.request).catch(() => {
        // Si no hay red y no está cacheado, devolvemos index.html para soportar SPA routing offline
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
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
