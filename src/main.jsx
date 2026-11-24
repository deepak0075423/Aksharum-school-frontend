import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App.jsx';
import './styles/global.css';
import { installTextGuard } from './utils/textGuard';
import { installFieldIds } from './utils/fieldIds';
import { installNoFocusZoom } from './utils/noFocusZoom';

// A tapped field no longer zooms an iPhone's page in for good — utils/noFocusZoom.
installNoFocusZoom();

// Every text box takes English and never markup, while it is typed in (utils/textRules).
installTextGuard();
// Every form field has an id and every label its field (Chrome's DevTools
// form-field issues) — utils/fieldIds.
installFieldIds();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: { borderRadius: '8px', fontSize: '14px' },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>,
);
