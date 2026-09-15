import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AppV6 from './AppV6';
import './styles.css';
import './cute.css';
import './work.css';
import './v5.css';
import './connected.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppV6 />
  </StrictMode>,
);
