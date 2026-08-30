import { apiRequest } from './apiClient';
import { auth } from './services';

/**
 * Converts a VAPID public key base64 URL string to a Uint8Array.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Attempts to subscribe the logged-in merchant to push notifications.
 * Fails silently to prevent crashing any UI if notifications are blocked
 * or not supported.
 */
export async function subscribeToPushNotifications(): Promise<void> {
  if (typeof window === 'undefined') return;

  // Silent check: check compatibility
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    console.log('[Push] Browser does not support Push Notifications.');
    return;
  }

  // Check if merchant session is present
  const token = auth.merchantToken();
  if (!token) {
    console.log('[Push] No active merchant token, skipping push subscription.');
    return;
  }

  try {
    // 1. Request notification permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('[Push] Push permission denied/dismissed.');
      return;
    }

    // 2. Register/Retrieve Service Worker
    let registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.log('[Push] Service worker registered for push.');
    }

    // Wait if the service worker is installing
    if (registration.installing) {
      await new Promise<void>((resolve) => {
        registration!.installing!.addEventListener('statechange', (e) => {
          if ((e.target as any).state === 'activated') {
            resolve();
          }
        });
      });
    }

    // 3. Download VAPID public key from backend
    const res = await apiRequest<{ vapidPublicKey: string }>('/api/public/push/vapid-public-key');
    if (!res || !res.vapidPublicKey) {
      throw new Error('VAPID public key not returned by backend.');
    }

    // 4. Subscribe PushManager
    const applicationServerKey = urlBase64ToUint8Array(res.vapidPublicKey);
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey as any
    });

    const subJSON = subscription.toJSON();
    if (!subJSON.endpoint || !subJSON.keys || !subJSON.keys.p256dh || !subJSON.keys.auth) {
      throw new Error('Web Push subscription details are incomplete.');
    }

    // 5. Upload subscription endpoint to backend
    await apiRequest('/api/merchant/push/subscribe', {
      method: 'POST',
      token,
      body: {
        endpoint: subJSON.endpoint,
        keys: {
          p256dh: subJSON.keys.p256dh,
          auth: subJSON.keys.auth
        }
      }
    });

    console.log('[Push] Successfully registered for push notifications.');
  } catch (error) {
    // Silent failure as per specifications
    console.warn('[Push] Subscription failed silently:', error);
  }
}

/**
 * Attempts to unsubscribe the current client subscription from the backend.
 * Fails silently.
 */
export async function unsubscribeFromPushNotifications(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  const token = auth.merchantToken();
  if (!token) return;

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return;

    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    // Remove client-side
    await subscription.unsubscribe();

    // Call backend API to remove
    await apiRequest('/api/merchant/push/unsubscribe', {
      method: 'POST',
      token,
      body: {
        endpoint: subscription.endpoint
      }
    });

    console.log('[Push] Successfully unsubscribed from push notifications.');
  } catch (error) {
    console.warn('[Push] Unsubscription failed silently:', error);
  }
}
