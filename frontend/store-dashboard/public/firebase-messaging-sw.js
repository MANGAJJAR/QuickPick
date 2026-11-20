/* Firebase Cloud Messaging service worker: shows push notifications while the app is closed.
   Public web config comes in through the query string (set by src/push/push.ts), so no key is hard-coded here. */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js')

const p = new URL(self.location).searchParams
firebase.initializeApp({
  apiKey: p.get('apiKey'),
  projectId: p.get('projectId'),
  messagingSenderId: p.get('messagingSenderId'),
  appId: p.get('appId'),
})
// With a `notification` payload the SDK displays it automatically; this just keeps the worker registered.
firebase.messaging()

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const orderId = event.notification.data && event.notification.data.FCM_MSG && event.notification.data.FCM_MSG.data
    ? event.notification.data.FCM_MSG.data.order_id : ''
  event.waitUntil(clients.openWindow(orderId ? '/orders?order=' + orderId : '/notifications'))
})
