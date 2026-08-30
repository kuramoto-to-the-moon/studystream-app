import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const overlayOnly = window.location.pathname === '/overlay' || new URLSearchParams(window.location.search).get('view') === 'overlay';
document.documentElement.classList.toggle('overlay-page', overlayOnly);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
