self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()))

const ALLOWED_URLS = ['/checkin', '/dashboard', '/proposals']

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  const url = ALLOWED_URLS.includes(data.url) ? data.url : '/checkin'
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Macronet', {
      body: data.body ?? 'Log your hours for today',
      icon: '/icon.png',
      badge: '/icon.png',
      data: { url },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/checkin'
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If a window is already on the target URL, just focus it
        for (const client of clientList) {
          if (client.url.endsWith(url) && 'focus' in client) return client.focus()
        }
        // Navigate an existing window to the URL
        if (clientList.length > 0 && 'navigate' in clientList[0]) {
          return clientList[0].navigate(url).then(c => c && c.focus())
        }
        // Otherwise open a new window
        return clients.openWindow(url)
      })
  )
})
