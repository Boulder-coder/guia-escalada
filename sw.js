// sw.js - Precarga completa para offline total (con SVGs)
const CACHE_NAME = 'guia-escalada-v5';
const DATA_JSON_URL = '/guia-escalada/datos/datos.json';

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
  console.log('[SW] Instalando y precargando TODO el contenido (JPGs + SVGs)...');
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      
      // 1. Cachear recursos críticos
      console.log('[SW] Cacheando recursos críticos...');
      await cache.addAll([
        '/guia-escalada/',
        '/guia-escalada/index.html',
        DATA_JSON_URL,
      ]);
      
      // 2. Obtener todas las URLs
      const allAssetUrls = await getAllAssetUrls();
      console.log(`[SW] Precargando ${allAssetUrls.length} assets...`);
      
      let successCount = 0;
      let failCount = 0;
      const failedUrls = [];
      
      for (let i = 0; i < allAssetUrls.length; i++) {
        const url = allAssetUrls[i];
        try {
          const response = await fetch(url);
          if (response.ok) {
            await cache.put(url, response);
            successCount++;
          } else {
            failCount++;
            // Solo mostrar warning si no es 404 (para no saturar la consola)
            if (response.status !== 404) {
              console.warn(`[SW] Falló (HTTP ${response.status}): ${url}`);
            } else {
              // Para 404, solo guardamos en array para el log final
              failedUrls.push(url);
            }
          }
        } catch (error) {
          failCount++;
          console.warn(`[SW] Error de red: ${url}`, error);
        }
        
        // Log de progreso cada 20 assets
        if ((successCount + failCount) % 20 === 0 || i === allAssetUrls.length - 1) {
          console.log(`[SW] Progreso: ${successCount + failCount}/${allAssetUrls.length} (Éxitos: ${successCount}, Fallos: ${failCount})`);
        }
      }
      
      console.log(`[SW] Precarga completada.`);
      console.log(`[SW] ✅ Éxitos: ${successCount}`);
      console.log(`[SW] ❌ Fallos: ${failCount} (archivos no encontrados o errores de red)`);
      if (failedUrls.length > 0 && failedUrls.length <= 10) {
        console.log(`[SW] Archivos no encontrados (404):`, failedUrls);
      } else if (failedUrls.length > 10) {
        console.log(`[SW] ${failedUrls.length} archivos no encontrados (404) - normal si aún no has subido todos los SVGs`);
      }
      
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

// Fetch: estrategia Cache First para todo (con fallbacks elegantes)
self.addEventListener('fetch', event => {
  const url = event.request.url;
  
  // Para datos.json: Network First (permite actualizaciones)
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
  
  // Para imágenes JPG y SVGs: Cache First
  if (url.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        // Si no está en caché, intentar red y guardar
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => {
          // Fallback para SVGs que no existen
          if (url.match(/\.svg$/)) {
            const emptySvg = `
