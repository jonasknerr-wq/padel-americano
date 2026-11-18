import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles.css';
import { initAppHeight } from './viewport';

initAppHeight(); // vor dem ersten Rendern: korrekte Höhe für iPhone-Home-Bildschirm-Apps
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
