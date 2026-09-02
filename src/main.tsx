import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/noto-sans-jp';
import { App } from './App';
import './fonts.css';
import './styles/ui.css';
import './styles.css';
import './styles/board.css';
import './styles/editor.css';

const overlayOnly = window.location.pathname === '/overlay' || new URLSearchParams(window.location.search).get('view') === 'overlay';
document.documentElement.classList.toggle('overlay-page', overlayOnly);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
