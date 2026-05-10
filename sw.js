// sw.js - Service Worker para Guía de Boulder (con precaching de fotos)
const CACHE_NAME = 'boulder-guide-v2';
const DYNAMIC_CACHE = 'boulder-dynamic-v2';

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

// Variable para almacenar todas las URLs de fotos una vez cargadas
let allImageUrls = [];

// Función para obtener todas las URLs de fotos desde datos.json
async function fetchAllImageUrls() {
  try {
    const response = await fetch('/datos/datos.json');
    const data = await response.json();
    const urls = [];
    
    // Recorrer todos los sectores, bloques y vías para extraer las fotos
    data.sectores.forEach(sector => {
      // Portada del sector
      if (sector.portada) urls.push(`${sector.portada}.jpg`);
      
      // Mapas
      if (sector.mapa) urls.push(`${sector.mapa}.jpg`);
      if (sector.mapa_2) urls.push(`${sector.mapa_2}.jpg`);
      if (sector.mapa_3) urls.push(`${sector.mapa_3}.jpg`);
      
      // SVGs de mapas
      if (sector.mapa) urls.push(`${sector.mapa}.svg`);
      if (sector.mapa_2) urls.push(`${sector.mapa_2}.svg`);
      if (sector.mapa_3) urls.push(`${sector.mapa_3}.svg`);
      
      // Croquis
      if (sector.croquis_list) {
        sector.croquis_list.forEach(croq => {
          if (croq.imagen) urls.push(`${croq.imagen}.jpg`);
          if (croq.svg) urls.push(`${croq.svg}.svg`);
        });
      }
      
      // Bloques y sus fotos
      sector.bloques.forEach(bloque => {
        if (bloque.foto_base) {
          urls.push(`${bloque.foto_base}.jpg`);
          urls.push(`${bloque.foto_base}.svg`);
        }
      });
    });
    
    // Eliminar duplicados
    const uniqueUrls = [...new Set(urls)];
    console.log('[SW] URLs de fotos encontradas para precache:', uniqueUrls.length);
    return uniqueUrls;
  } catch (error) {
    console.error('[SW] Error al obtener URLs de fotos:', error);
    return [];
  }
}

// Instalación: cachear recursos estáticos y todas las fotos
self.addEventListener('install', event => {
  console.log('[SW] Instalando...');
  event.waitUntil(
    (async () => {
      // Primero cachear recursos estáticos
      const staticCache = await caches.open(CACHE_NAME);
      await staticCache.addAll(STATIC_ASSETS);
      console.log('[SW] Recursos estáticos cacheados');
      
      // Luego obtener y cachear todas las fotos
      allImageUrls = await fetchAllImageUrls();
      if (allImageUrls.length > 0) {
        const imageCache = await caches.open(DYNAMIC_CACHE);
        // Cachear las fotos en lotes para no saturar
        for (let i = 0; i < allImageUrls.length; i += 10) {
          const batch = allImageUrls.slice(i, i + 10);
          await Promise.all(
            batch.map(url => 
              fetch(url, { mode: 'cors' })
                .then(response => {
                  if (response.ok) imageCache.put(url, response);
                })
                .catch(err => console.warn('[SW] No se pudo cachear:', url, err))
            )
          );
          console.log(`[SW] Lote ${Math.floor(i/10)+1} completado`);
        }
        console.log('[SW] Todas las fotos cacheadas');
      }
      await self.skipWaiting();
    })()
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

// Estrategia: Cache First con respaldo de red
self.addEventListener('fetch', event => {
  const url = event.request.url;
  
  // Para datos.json: Network First (siempre intenta red, luego caché)
  if (url.includes('/datos/datos.json')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clonedResponse = response.clone();
          caches.open(DYNAMIC_CACHE).then(cache => {
            cache.put(event.request, clonedResponse);
          });
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
    return;
  }
  
  // Para imágenes y SVGs: Cache First (si está en caché, sírvela; si no, intenta red)
  if (url.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        // Si no está en caché, intentar obtener de la red
        return fetch(event.request).then(response => {
          return caches.open(DYNAMIC_CACHE).then(cache => {
            cache.put(event.request, response.clone());
            return response;
          });
        }).catch(() => {
          // Fallback: imagen por defecto si existe
          return caches.match('/fotos/placeholder.jpg');
        });
      })
    );
    return;
  }
  
  // Para HTML, CSS, JS: Cache First
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
  
  // Estrategia por defecto: Network First, fallback a caché
  event.respondWith(
    fetch(event.request)
      .then(response => {
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
