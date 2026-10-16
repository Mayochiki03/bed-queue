import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App';
import { PopupProvider } from './components/Popup';
import './index.css';
import { SessionProvider } from './lib/session';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/admin">
      <SessionProvider>
        <PopupProvider>
          <App />
        </PopupProvider>
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
);
