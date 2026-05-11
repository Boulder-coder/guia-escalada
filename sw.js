// sw.js - Precarga completa para offline total (con soporte para parámetros en SVGs)
const CACHE_NAME = 'guia-escalada-v6';
const DATA_JSON_URL = '/guia-escalada/datos/datos.json';

// Normaliza URLs eliminando parámetros de timestamp para el cacheo
function normalizeUrl(url) {
    try {
        const urlObj = new URL(url);
        // Eliminar el parámetro 'v' (timestamp) y otros parámetros dinámicos
        urlObj.searchParams.delete('v');
        urlObj.searchParams.delete('timestamp');
        return urlObj.toString();
    } catch (e) {
        return url;
    }
}

// Esta función obtiene TODAS las URLs (JPG y SVG) del datos.json
async function getAllAssetUrls() {
  try {
    const response = await fetch(DATA_JSON_URL);
    const data = await response.json();
    const urls = new Set();
    
    const baseUrl = '/guia-escalada/';
    
    data.sectores.forEach(sector => {
      // Portada (JPG)
      if (sector.portada) urls.add(`${baseUrl}${sector.portada}.jpg`);
      
      // Mapas (JPG y SVG)
      if (sector.mapa) {
        urls.add(`${baseUrl}${sector.mapa}.jpg`);
        urls.add(`${baseUrl}${sector.mapa}.svg`);
      }
      if (sector.mapa_2) {
        urls.add(`${baseUrl}${sector.mapa_2}.jpg`);
        urls.add(`${baseUrl}${sector.mapa_2}.svg`);
      }
      if (sector.mapa_3) {
        urls.add(`${baseUrl}${sector.mapa_3}.jpg`);
        urls.add(`${baseUrl}${sector.mapa_3}.svg`);
      }
      
      // Croquis (JPG y SVG)
      if (sector.croquis_list) {
        sector.croquis_list.forEach(croq => {
          if (croq.imagen) urls.add(`${baseUrl}${croq.imagen}.jpg`);
          if (croq.svg) urls.add(`${baseUrl}${croq.svg}.svg`);
        });
      }
      
      // Bloques (foto JPG y SVG de líneas)
      if (sector.bloques) {
        sector.bloques.forEach(bloque => {
          if (bloque.foto_base) {
            urls.add(`${baseUrl}${bloque.foto_base}.jpg`);
            urls.add(`${baseUrl}${bloque.foto_base}.svg`);
          }
        });
      }
    });
    
    const urlArray = Array.from(urls);
    console.log(`[SW] Total de assets encontrados: ${urlArray.length} (JPGs + SVGs)`);
    return urlArray;
  } catch (error) {
    console.error('[SW] Error al obtener las URLs:', error);
    return [];
  }
}

// Instalación: precarga de TODOS los assets (JPG y SVG)
self.addEventListener('install', event => {
  console.log('[SW] Instalando v6 con soporte offline para SVGs...');
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      
      console.log('[SW] Cacheando recursos críticos...');
      await cache.addAll([
        '/guia-escalada/',
        '/guia-escalada/index.html',
        DATA_JSON_URL,
      ]);
      
      const allAssetUrls = await getAllAssetUrls();
      console.log(`[SW] Precargando ${allAssetUrls.length} assets...`);
      
      let successCount = 0;
      let failCount = 0;
      
      for (let i = 0; i < allAssetUrls.length; i++) {
        const url = allAssetUrls[i];
        try {
          const response = await fetch(url);
          if (response.ok) {
            await cache.put(url, response);
            successCount++;
          } else {
            failCount++;
            if (response.status !== 404) {
              console.warn(`[SW] Falló (HTTP ${response.status}): ${url}`);
            }
          }
        } catch (error) {
          failCount++;
        }
        
        if ((successCount + failCount) % 20 === 0 || i === allAssetUrls.length - 1) {
          console.log(`[SW] Progreso: ${successCount + failCount}/${allAssetUrls.length} (Éxitos: ${successCount}, Fallos: ${failCount})`);
        }
      }
      
      console.log(`[SW] Precarga completada. ✅ Éxitos: ${successCount}, ❌ Fallos: ${failCount}`);
      await self.skipWaiting();
    })()
  );
});

// Activación: limpiar cachés antiguas
self.addEventListener('activate', event => {
  console.log('[SW] Activando y limpiando cachés antiguas...');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log(`[SW] Eliminando caché antigua: ${key}`);
            return caches.delete(key);
          })
      );
    }).then(() => {
      console.log('[SW] Activación completada, tomando control...');
      return self.clients.claim();
    })
  );
});

// Fetch: estrategia inteligente con normalización de URLs
self.addEventListener('fetch', event => {
  const originalUrl = event.request.url;
  const normalizedUrl = normalizeUrl(originalUrl);
  
  // Para datos.json: Network First
  if (originalUrl.includes('datos/datos.json')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(normalizedUrl, clone));
          return response;
        })
        .catch(() => caches.match(normalizedUrl))
    );
    return;
  }
  
  // Para imágenes y SVGs: Cache First usando URL normalizada
  if (originalUrl.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) {
    event.respondWith(
      caches.match(normalizedUrl).then(cachedResponse => {
        if (cachedResponse) {
          console.log(`[SW] Servido desde caché: ${normalizedUrl}`);
          return cachedResponse;
        }
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(normalizedUrl, clone));
          }
          return response;
        }).catch(() => {
          if (originalUrl.match(/\.svg$/)) {
            const emptySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="#cccccc"/><text x="50" y="50" text-anchor="middle" dy=".3em" fill="#666">SVG no disponible offline</text></svg>`;
            return new Response(emptySvg, {
              headers: { 'Content-Type': 'image/svg+xml' }
            });
          }
          return new Response('Recurso no disponible offline', { status: 404 });
        });
      })
    );
    return;
  }
  
  // Para HTML, CSS, JS: Cache First
  if (originalUrl.match(/\.(html|css|js)$/) || originalUrl.includes('/guia-escalada/')) {
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
