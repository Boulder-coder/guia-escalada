// sw.js: Precarga completa con soporte offline para SVGs con timestamp
const CACHE_NAME = 'guia-escalada-v3';
const DATA_JSON_URL = '/guia-escalada/datos/datos.json';

// Normaliza URLs eliminando parámetros de timestamp
function normalizeUrl(url) {
    try {
        const urlObj = new URL(url, location.origin);
        // Eliminar el parámetro 'v' (timestamp) y otros parámetros dinámicos
        urlObj.searchParams.delete('v');
        urlObj.searchParams.delete('timestamp');
        urlObj.searchParams.delete('_');
        return urlObj.toString();
    } catch (e) {
        return url;
    }
}

// Obtiene todas las URLs de assets
async function getAllAssetUrls() {
    try {
        const response = await fetch(DATA_JSON_URL);
        const data = await response.json();
        const urls = new Set();
        const baseUrl = '/guia-escalada/';
        
        data.sectores.forEach(sector => {
            // Portadas JPG
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
            
            // Bloques (JPG y SVG)
            if (sector.bloques) {
                sector.bloques.forEach(bloque => {
                    if (bloque.foto_base) {
                        urls.add(`${baseUrl}${bloque.foto_base}.jpg`);
                        urls.add(`${baseUrl}${bloque.foto_base}.svg`);
                    }
                });
            }
        });
        
        return Array.from(urls);
    } catch (error) {
        console.error('[SW] Error al obtener URLs:', error);
        return [];
    }
}

// Instalación: precarga de todos los assets
self.addEventListener('install', event => {
    console.log('[SW] Instalando v8...');
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_NAME);
            
            // Recursos críticos
            await cache.addAll([
                '/guia-escalada/',
                '/guia-escalada/index.html',
                DATA_JSON_URL,
            ]);
            
            // Precargar todos los assets
            const allUrls = await getAllAssetUrls();
            console.log(`[SW] Precargando ${allUrls.length} assets...`);
            
            let success = 0, fail = 0;
            for (const url of allUrls) {
                try {
                    const response = await fetch(url);
                    if (response.ok) {
                        await cache.put(url, response);
                        success++;
                    } else {
                        fail++;
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

// Activación
self.addEventListener('activate', event => {
    console.log('[SW] Activando...');
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => {
                        console.log(`[SW] Eliminando caché antigua: ${key}`);
                        return caches.delete(key);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch: estrategia inteligente con normalización de URLs
self.addEventListener('fetch', event => {
    const originalUrl = event.request.url;
    const normalizedUrl = normalizeUrl(originalUrl);
    
    // Excluir peticiones a otros dominios
    if (!originalUrl.includes('/guia-escalada/') && !originalUrl.includes('cdn.jsdelivr.net') && !originalUrl.includes('fonts.googleapis.com') && !originalUrl.includes('fonts.cdnfonts.com')) {
        return;
    }
    
    // datos.json: Network First
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
    
    // Para imágenes y SVGs: Cache First (usando URL normalizada)
    if (originalUrl.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) {
        event.respondWith(
            caches.match(normalizedUrl).then(cachedResponse => {
                if (cachedResponse) {
                    // Si está en caché, lo devolvemos
                    return cachedResponse;
                }
                // Si no está en caché, vamos a la red
                return fetch(event.request).then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(normalizedUrl, clone));
                    }
                    return response;
                }).catch(() => {
                    // Fallback para SVGs que no existen
                    if (originalUrl.match(/\.svg$/)) {
                        const emptySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="#cccccc"/><text x="50" y="50" text-anchor="middle" dy=".3em" fill="#666">SVG no disponible offline</text></svg>`;
                        return new Response(emptySvg, {
                            headers: { 'Content-Type': 'image/svg+xml' }
                        });
                    }
                    return new Response('Imagen no disponible', { status: 404 });
                });
            })
        );
        return;
    }
    
    // Para HTML, CSS, JS: Cache First
    if (originalUrl.match(/\.(html|css|js)$/)) {
        event.respondWith(
            caches.match(originalUrl).then(cached => {
                if (cached) return cached;
                return fetch(event.request).then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(originalUrl, clone));
                    }
                    return response;
                });
            })
        );
        return;
    }
    
    // Por defecto: Network First
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});
