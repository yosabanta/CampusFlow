/**
 * CampusFlow MVP — Service Worker (App Shell Cache)
 * Enables offline application shell loading on low-bandwidth campus networks
 */

const CACHE_NAME = "campusflow-shell-v3";

const APP_SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/variables.css",
  "./css/base.css",
  "./css/layout.css",
  "./css/components.css",
  "./css/forms.css",
  "./css/tables.css",
  "./css/responsive.css",
  "./css/themes.css",
  "./js/app.js",
  "./js/api.js",
  "./js/auth.js",
  "./js/router.js",
  "./js/state.js",
  "./js/notifications.js",
  "./js/theme.js",
  "./js/ui.js",
  "./js/utils.js",
  "./js/student.js",
  "./js/hostel.js",
  "./js/academic.js",
  "./js/admin.js",
  "./js/operations.js",
  "./assets/icons/icon-192.svg",
  "./assets/icons/icon-512.svg"
];

// Install: Pre-cache static application shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[ServiceWorker] Pre-caching static app shell");
      return cache.addAll(APP_SHELL_ASSETS).catch((err) => {
        console.warn("[ServiceWorker] Caching non-fatal issue:", err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up legacy caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log("[ServiceWorker] Removing stale cache:", name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Cache-first for local static shell, strictly Network-only for private APIs
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // CRITICAL: NEVER cache private authenticated API requests or health checks
  if (url.pathname.includes("/api/") || url.pathname.includes("/health")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-first for application shell assets with network fallback
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        // Cache newly fetched static assets
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === "basic") {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Offline fallback for navigation requests
        if (event.request.mode === "navigate") {
          return caches.match("./index.html");
        }
      });
    })
  );
});
