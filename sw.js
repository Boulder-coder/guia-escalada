// sw.js - Service Worker para Guía de Boulder
const CACHE_NAME = 'boulder-guide-v1';
const DYNAMIC_CACHE = 'boulder-dynamic-v1';

// Recursos estáticos a cachear (los esenciales para el primer arranque)
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/datos/datos.json',
  'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css',
  'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js',
  'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap',
  'https://fonts.cdnfonts.com/css/cocogoose'
];

// Instalación: cachear recursos estáticos
self.addEventListener('install', event => {
  console.log('[SW] Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activación: limpiar cachés antiguas
self.addEventListener('activate', event => {
  console.log('[SW] Activando...');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME && key !== DYNAMIC_CACHE)
          .map(key => {
            console.log('[SW] Eliminando caché antigua:', key);
            return caches.delete(key);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Estrategia: Network First para datos.json, Cache First para el resto
self.addEventListener('fetch', event => {
  const url = event.request.url;
  
  // Estrategia para datos.json: Network First (siempre intenta red, luego caché)
  if (url.includes('/datos/datos.json')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Clonar respuesta y guardar en caché dinámica
          const clonedResponse = response.clone();
          caches.open(DYNAMIC_CACHE).then(cache => {
            cache.put(event.request, clonedResponse);
          });
          return response;
        })
        .catch(() => {
          // Si falla la red, buscar en caché
          return caches.match(event.request);
        })
    );
    return;
  }
  
  // Estrategia para fotos e imágenes: Cache First (rápido, luego actualiza en segundo plano)
  if (url.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        if (cachedResponse) {
          // Actualizar en segundo plano sin esperar
          fetch(event.request).then(response => {
            caches.open(DYNAMIC_CACHE).then(cache => {
              cache.put(event.request, response);
            });
          }).catch(() => {});
          return cachedResponse;
        }
        return fetch(event.request).then(response => {
          return caches.open(DYNAMIC_CACHE).then(cache => {
            cache.put(event.request, response.clone());
            return response;
          });
        }).catch(() => {
          // Fallback: imagen por defecto
          if (url.match(/\.jpg$/)) {
            return caches.match('/fotos/placeholder.jpg');
          }
        });
      })
    );
    return;
  }
  
  // Estrategia para HTML, CSS, JS: Cache First (prioriza caché para velocidad)
  if (url.match(/\.(html|css|js)$/) || url.includes('index.html')) {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        if (cachedResponse) {
          // Actualizar en segundo plano
          fetch(event.request).then(response => {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, response);
            });
          }).catch(() => {});
          return cachedResponse;
        }
        return fetch(event.request).then(response => {
          return caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, response.clone());
            return response;
          });
        });
      })
    );
    return;
  }
  
  // Estrategia por defecto (Network First, fallback a caché)
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Guardar en caché si es una petición GET exitosa
        if (event.request.method === 'GET') {
          const responseToCache = response.clone();
          caches.open(DYNAMIC_CACHE).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});