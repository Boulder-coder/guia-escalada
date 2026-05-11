// sw.js - Precarga Forzada para Offline Total
const CACHE_NAME = 'guia-escalada-v1'; // Cambia este número si quieres forzar una recarga completa en el futuro
const DATA_JSON_URL = '/guia-escalada/datos/datos.json';

// Esta función obtiene todas las URLs de tus fotos desde el datos.json
async function getAllImageUrls() {
  try {
    const response = await fetch(DATA_JSON_URL);
    const data = await response.json();
    const urls = new Set();

    data.sectores.forEach(sector => {
      // Añade la portada
      if (sector.portada) urls.add(`/guia-escalada/${sector.portada}.jpg`);
      // Añade los mapas
      if (sector.mapa) urls.add(`/guia-escalada/${sector.mapa}.jpg`);
      if (sector.mapa_2) urls.add(`/guia-escalada/${sector.mapa_2}.jpg`);
      if (sector.mapa_3) urls.add(`/guia-escalada/${sector.mapa_3}.jpg`);
      // Añade los fondos de los croquis
      if (sector.croquis_list) {
        sector.croquis_list.forEach(croq => {
          if (croq.imagen) urls.add(`/guia-escalada/${croq.imagen}.jpg`);
        });
      }
      // AÑADE LAS FOTOS DE TODOS LOS BLOQUES (¡Esta es la clave!)
      sector.bloques.forEach(bloque => {
        if (bloque.foto_base) {
          urls.add(`/guia-escalada/${bloque.foto_base}.jpg`);
          // Si también quieres precargar los SVGs de las líneas, descomenta la siguiente línea:
          // urls.add(`/guia-escalada/${bloque.foto_base}.svg`);
        }
      });
    });
    return Array.from(urls);
  } catch (error) {
    console.error('Error al obtener las URLs de las fotos:', error);
    return [];
  }
}

// Evento 'install': Aquí es donde ocurre la magia de la precarga
self.addEventListener('install', event => {
  console.log('[SW] Instalando y precargando contenido...');
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // 1. Añade a la caché la página principal y el JSON (esenciales)
      await cache.addAll([
        '/guia-escalada/',
        '/guia-escalada/index.html',
        DATA_JSON_URL,
      ]);
      
      // 2. Obtén la lista de todas las fotos
      const allImageUrls = await getAllImageUrls();
      console.log(`[SW] Se van a precargar ${allImageUrls.length} imágenes.`);

      // 3. Descarga y guarda cada foto en la caché
      // Esto es lo que causará la pantalla de carga prolongada, pero necesaria.
      for (const url of allImageUrls) {
        try {
          const response = await fetch(url);
          if (response.ok) {
            await cache.put(url, response);
          } else {
            console.warn(`[SW] No se pudo precargar (HTTP ${response.status}): ${url}`);
          }
        } catch (error) {
          console.warn(`[SW] Error de red al precargar: ${url}`, error);
        }
      }
      console.log('[SW] Precarga completada.');
      await self.skipWaiting(); // Fuerza a que el SW nuevo tome el control inmediatamente
    })()
  );
});

// Evento 'fetch': Para servir los archivos desde la caché cuando estés offline
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
      .catch(() => new Response('Recurso no encontrado offline', { status: 404 }))
  );
});

// Evento 'activate': Limpia cachés antiguas y toma el control
self.addEventListener('activate', event => {
  console.log('[SW] Activado y limpiando cachés antiguas...');
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});
