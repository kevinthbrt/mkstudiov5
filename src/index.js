import React from 'react';
import ReactDOM from 'react-dom/client'; // Importez react-dom/client au lieu de react-dom
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root')); // Créez une racine
root.render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);