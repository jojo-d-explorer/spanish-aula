import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AccessGate from './AccessGate.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AccessGate />
  </StrictMode>,
)

// PWA-lite: installability + standalone display only, no offline caching.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
