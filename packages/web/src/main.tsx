import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import App from './App';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });

  // When a new service worker takes control (after skipWaiting), reload the
  // page so the user gets the updated app shell. The flag prevents double-
  // reloads if multiple controllerchange events fire.
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) {
      return;
    }
    refreshing = true;
    window.location.reload();
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(rootElement).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
