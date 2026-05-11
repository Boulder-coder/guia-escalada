// sw.js - Precarga completa para offline total (versión mejorada)
const CACHE_NAME = 'guia-escalada-v3';
const DATA_JSON_URL = '/guia-escalada/datos/datos.json';

// Esta función obtiene TODAS las URLs del datos.json (fotos JPG y SVG)
async function getAllAssetUrls() {
  try {
    const response = await fetch(DATA_JSON_URL);
    const data = await response.json();
    const urls = new Set();
    
    // Añadir la base del proyecto
    const baseUrl = '/guia-escalada/';
    
    data.sectores.forEach(sector => {
      console.log('[SW] Procesando sector:', sector.nombre);
      
      // Portada del sector (JPG)
      if (sector.portada) {
        urls.add(`${baseUrl}${sector.portada}.jpg`);
        console.log(`[SW] Añadida portada: ${sector.portada}.jpg`);
      }
      
      // Mapas (JPG y SVG)
      if (sector.mapa) {
        urls.add(`${baseUrl}${sector.mapa}.jpg`);
        urls.add(`${baseUrl}${sector.mapa}.svg`);
        console.log(`[SW] Añadido mapa: ${sector.mapa}.jpg y .svg`);
      }
      if (sector.mapa_2) {
        urls.add(`${baseUrl}${sector.mapa_2}.jpg`);
        urls.add(`${baseUrl}${sector.mapa_2}.svg`);
        console.log(`[SW] Añadido mapa_2: ${sector.mapa_2}.jpg y .svg`);
      }
      if (sector.mapa_3) {
        urls.add(`${baseUrl}${sector.mapa_3}.jpg`);
        urls.add(`${baseUrl}${sector.mapa_3}.svg`);
        console.log(`[SW] Añadido mapa_3: ${sector.mapa_3}.jpg y .svg`);
      }
      
      // Croquis (JPG y SVG)
      if (sector.croquis_list) {
        sector.croquis_list.forEach((croq, idx) => {
          if (croq.imagen) {
            urls.add(`${baseUrl}${croq.imagen}.jpg`);
            urls.add(`${baseUrl}${croq.svg}.svg`);
            console.log(`[SW] Añadido croquis ${idx + 1}: ${croq.imagen}.jpg y .svg`);
          }
        });
      }
      
      // BLOQUES: Aquí está la clave - recorremos todos los bloques
      if (sector.bloques && sector.bloques.length > 0) {
        console.log(`[SW] Procesando ${sector.bloques.length} bloques para ${sector.nombre}`);
        sector.bloques.forEach((bloque, idx) => {
          if (bloque.foto_base) {
            // Añadir foto JPG del bloque
            urls.add(`${baseUrl}${bloque.foto_base}.jpg`);
            // Añadir SVG del bloque (las líneas)
            urls.add(`${baseUrl}${bloque.foto_base}.svg`);
            console.log(`[SW] Bloque ${idx + 1}: ${bloque.foto_base}.jpg y .svg`);
          }
        });
      }
    });
    
    const urlArray = Array.from(urls);
    console.log(`[SW] Total de assets encontrados: ${urlArray.length}`);
    return urlArray;
  } catch (error) {
    console.error('[SW] Error al obtener las URLs:', error);
    return [];
  }
}

// Evento 'install': Precarga forzada de todo el contenido
self.addEventListener('install', event => {
  console.log('[SW] Instalando y precargando TODO el contenido...');
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      
      // 1. Recursos críticos (página principal y JSON)
      console.log('[SW] Cacheando recursos críticos...');
      await cache.addAll([
        '/guia-escalada/',
        '/guia-escalada/index.html',
        DATA_JSON_URL,
      ]);
      
      // 2. Obtener todas las URLs de assets (fotos y SVGs)
      const allAssetUrls = await getAllAssetUrls();
      console.log(`[SW] Iniciando precarga de ${allAssetUrls.length} assets...`);
      
      let successCount = 0;
      let failCount = 0;
      
      // 3. Descargar y cachear cada asset
      for (let i = 0; i < allAssetUrls.length; i++) {
        const url = allAssetUrls[i];
        try {
          const response = await fetch(url);
          if (response.ok) {
            await cache.put(url, response);
            successCount++;
          } else {
            failCount++;
            console.warn(`[SW] Falló (HTTP ${response.status}): ${url}`);
          }
        } catch (error) {
          failCount++;
          console.warn(`[SW] Error de red: ${url}`, error);
        }
        
        // Log de progreso cada 10 assets
        if ((successCount + failCount) % 10 === 0 || i === allAssetUrls.length - 1) {
          console.log(`[SW] Progreso: ${successCount + failCount}/${allAssetUrls.length} (Éxitos: ${successCount}, Fallos: ${failCount})`);
        }
      }
      
      console.log(`[SW] Precarga completada. Éxitos: ${successCount}, Fallos: ${failCount}`);
      await self.skipWaiting();
    })()
  );
});

// Evento 'activate': Limpia cachés antiguas y toma control
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

// Evento 'fetch': Sirve desde caché si existe, si no, va a la red
self.addEventListener('fetch', event => {
  const url = event.request.url;
  
  // Para datos.json: Network First (siempre intenta red, luego caché)
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
  
  // Para todo lo demás: Cache First (si está en caché, sírvelo; si no, ve a red)
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      // Si no está en caché, ir a la red y guardar para la próxima
      return fetch(event.request).then(response => {
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Fallback amigable para imágenes rotas
        if (url.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) {
          // Puedes crear una imagen de placeholder si quieres
          return new Response('Imagen no disponible offline', { status: 404, headers: { 'Content-Type': 'text/plain' } });
        }
        return new Response('Recurso no disponible offline', { status: 404 });
      });
    })
  );
});
