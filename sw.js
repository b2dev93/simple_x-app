// Simple-x Service Worker v1.0
const CACHE_NAME = 'simplex-v1'
const OFFLINE_URL = '/simple_x-app/'

// Assets to pre-cache (offline shell)
const PRECACHE_ASSETS = [
  '/simple_x-app/',
  '/simple_x-app/index.html',
  '/simple_x-app/manifest.json',
  '/simple_x-app/icons/icon-192.png',
  '/simple_x-app/icons/icon-512.png',
]

// ── INSTALL ───────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_ASSETS)
    }).then(() => self.skipWaiting())
  )
})

// ── ACTIVATE ──────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  )
})

// ── FETCH ─────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  // Don't intercept Supabase API calls or external resources
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('cdn.jsdelivr.net') ||
    request.method !== 'GET'
  ) {
    return
  }

  // Network-first for HTML (always get fresh app shell)
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match(OFFLINE_URL))
    )
    return
  }

  // Cache-first for static assets (icons, manifest)
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached
      return fetch(request).then(response => {
        // Only cache same-origin successful responses
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone))
        }
        return response
      })
    })
  )
})

// ── PUSH NOTIFICATIONS ────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return
  let data
  try {
    data = event.data.json()
  } catch {
    data = { title: 'Simple-x', body: event.data.text() }
  }

  const options = {
    body: data.body || 'You have a new notification',
    icon: '/simple_x-app/icons/icon-192.png',
    badge: '/simple_x-app/icons/badge-72.png',
    tag: data.tag || 'simplex-notification',
    data: { url: data.url || '/simple_x-app/' },
    vibrate: [200, 100, 200],
    renotify: true,
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Simple-x', options)
  )
})

// ── NOTIFICATION CLICK ────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/simple_x-app/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url.includes('simple_x-app') && 'focus' in client) {
          return client.focus()
        }
      }
      // Otherwise open new window
      if (clients.openWindow) return clients.openWindow(targetUrl)
    })
  )
})
