// Minimal service worker.
//
// Its only job here is to exist and be active — Chrome on Android will not
// let a webpage call `new Notification(...)` directly (it throws "Illegal
// constructor"); it insists on ServiceWorkerRegistration.showNotification()
// instead. Registering this file satisfies that requirement.
//
// Put this file in your project's `public/` folder so Vite serves it at
// the site root: public/sw.js -> https://yoursite.com/sw.js

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Tapping the notification focuses an already-open tab if there is one,
// otherwise opens a new one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientsList) => {
      for (const client of clientsList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});
