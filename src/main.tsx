import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ResearchEngineProvider } from './contexts/ResearchEngineContext.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ResearchEngineProvider>
      <App />
    </ResearchEngineProvider>
  </StrictMode>
);
