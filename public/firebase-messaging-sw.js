// Firebase Cloud Messaging Service Worker
// This runs in the background to receive push notifications when the app is closed

importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging-compat.js');

// Replace with your Firebase config values (these are public — safe to expose)
firebase.initializeApp({
  apiKey:            self.VITE_FIREBASE_API_KEY || 'YOUR_API_KEY',
  authDomain:        self.VITE_FIREBASE_AUTH_DOMAIN || 'YOUR_PROJECT.firebaseapp.com',
  projectId:         self.VITE_FIREBASE_PROJECT_ID || 'YOUR_PROJECT_ID',
  storageBucket:     self.VITE_FIREBASE_STORAGE_BUCKET || 'YOUR_PROJECT.appspot.com',
  messagingSenderId: self.VITE_FIREBASE_MESSAGING_SENDER_ID || 'YOUR_SENDER_ID',
  appId:             self.VITE_FIREBASE_APP_ID || 'YOUR_APP_ID',
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  const data = payload.data || {};

  self.registration.showNotification(title || 'Addis Bright', {
    body:    body || 'You have a new notification',
    icon:    '/icon-192.png',
    badge:   '/badge-72.png',
    tag:     data.type || 'general',
    data:    data,
    actions: [{ action: 'open', title: 'Open' }],
  });
});

// Click handler — open the app when notification is clicked
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  let url = '/';

  if (data.type === 'status_log') url = '/parent';
  if (data.type === 'message')    url = '/parent/messages';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'NAVIGATE', url });
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
