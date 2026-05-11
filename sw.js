// sw.js - Precarga completa para offline total (versión estable)
const CACHE_NAME = 'guia-escalada-v4';
const DATA_JSON_URL = '/guia-escalada/datos/datos.json';

// Esta función obtiene SOLO las URLs de las imágenes JPG (no SVGs)
async function getAllImageUrls() {
  try {
    const response = await fetch(DATA_JSON_URL);
    const data = await response.json();
    const urls = new Set();
    
    const baseUrl = '/guia-escalada/';
    
    data.sectores.forEach(sector => {
      // Portada
      if (sector.portada) urls.add(`${baseUrl}${sector.portada}.jpg`);
      
      // Mapas (solo JPG, los SVG se cargarán bajo demanda)
      if (sector.mapa) urls.add(`${baseUrl}${sector.mapa}.jpg`);
      if (sector.mapa_2) urls.add(`${baseUrl}${sector.mapa_2}.jpg`);
      if (sector.mapa_3) urls.add(`${baseUrl}${sector.mapa_3}.jpg`);
      
      // Croquis (solo JPG)
      if (sector.croquis_list) {
        sector.croquis_list.forEach(croq => {
          if (croq.imagen) urls.add(`${baseUrl}${croq.imagen}.jpg`);
        });
      }
      
      // Fotos de bloques (solo JPG)
      if (sector.bloques) {
        sector.bloques.forEach(bloque => {
          if (bloque.foto_base) urls.add(`${baseUrl}${bloque.foto_base}.jpg`);
        });
      }
    });
    
    const urlArray = Array.from(urls);
    console.log(`[SW] Total de imágenes JPG encontradas: ${urlArray.length}`);
    return urlArray;
  } catch (error) {
    console.error('[SW] Error al obtener las URLs:', error);
    return [];
  }
}

// Instalación: precarga de imágenes JPG
self.addEventListener('install', event => {
  console.log('[SW] Instalando...');
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      
      // Cachear recursos críticos
      console.log('[SW] Cacheando recursos críticos...');
      await cache.addAll([
        '/guia-escalada/',
        '/guia-escalada/index.html',
        DATA_JSON_URL,
      ]);
      
      // Obtener y cachear todas las imágenes JPG
      const imageUrls = await getAllImageUrls();
      console.log(`[SW] Precargando ${imageUrls.length} imágenes...`);
      
      let success = 0, fail = 0;
      for (const url of imageUrls) {
        try {
          const response = await fetch(url);
          if (response.ok) {
            await cache.put(url, response);
            success++;
          } else {
            fail++;
            // No mostrar warnings para 404 (son archivos que aún no existen)
            if (response.status !== 404) {
              console.warn(`[SW] Falló (${response.status}): ${url}`);
            }
          }
        } catch (err) {
          fail++;
        }
      }
      console.log(`[SW] Precarga completada. Éxitos: ${success}, Fallos: ${fail}`);
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
        keys.filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: estrategia inteligente
self.addEventListener('fetch', event => {
  const url = event.request.url;
  
  // Para datos.json: Network First
  if (url.includes('datos/datos.json')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }
  
  // Para SVGs: NO cachear, solo red (evita el error de parsing)
  if (url.match(/\.svg$/)) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Si falla, devolver un SVG vacío pero válido
        const emptySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="#cccccc"/><text x="50" y="50" text-anchor="middle" dy=".3em" fill="#666">SVG no disponible</text></svg>`;
        return new Response(emptySvg, {
          headers: { 'Content-Type': 'image/svg+xml' }
        });
      })
    );
    return;
  }
  
  // Para imágenes JPG: Cache First
  if (url.match(/\.jpg$/)) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }
  
  // Para HTML, CSS, JS: Cache First
  if (url.match(/\.(html|css|js)$/) || url.includes('/guia-escalada/')) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
    return;
  }
  
  // Por defecto: Network First
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
