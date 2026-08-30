import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { I18nProvider } from './lib/i18n'
import ErrorBoundary from './components/ErrorBoundary'
import { applyViewportModeClass, getDesktopViewPreference } from './lib/viewportMode'

// Initialize Desktop / Mobile-Compact viewport preference
applyViewportModeClass(getDesktopViewPreference());

// Point the PWA manifest at the admin-specific one when browsing under
// /admin, so "Add to Home Screen" from the admin panel installs an app
// that opens straight to /admin instead of the merchant root ("/").
// Previously both merchant and admin shared a single manifest with
// start_url "/", so an admin-installed home-screen icon always launched
// the merchant landing page — which looked exactly like the admin had
// been logged out, since the admin panel never actually loaded.
if (window.location.pathname.startsWith('/admin')) {
  const manifestLink = document.getElementById('app-manifest') as HTMLLinkElement | null;
  if (manifestLink) manifestLink.href = '/manifest-admin.json';
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ErrorBoundary>
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('ServiceWorker registration successful with scope: ', reg.scope);
        const notifyUpdate = (worker: ServiceWorker) => {
          window.dispatchEvent(new CustomEvent('sw:update', { detail: { waitingWorker: worker } }));
        };

        if (reg.waiting) {
          notifyUpdate(reg.waiting);
        }

        reg.onupdatefound = () => {
          const installingWorker = reg.installing;
          if (installingWorker) {
            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                notifyUpdate(installingWorker);
              }
            };
          }
        };
      })
      .catch((err) => console.log('ServiceWorker registration failed: ', err));
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  // @ts-expect-error - Custom property on window
  window.deferredPrompt = e;
  window.dispatchEvent(new CustomEvent('app-installable'));
});

// Prevent accidental pinch-to-zoom and multi-touch gesture zoom on mobile screens
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('gesturechange', (e) => e.preventDefault());
document.addEventListener('gestureend', (e) => e.preventDefault());

