import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import App from './App';
import './styles.css';

// Offline support for the website and home-screen app. The Android app bundles its files already.
if (import.meta.env.PROD && 'serviceWorker' in navigator && !Capacitor.isNativePlatform()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Offline support unavailable', e));
  });
  // A tapped notification asks an already-open app to show a page.
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'open' && typeof e.data.url === 'string') location.href = e.data.url;
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
