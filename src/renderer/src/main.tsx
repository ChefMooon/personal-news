import React from 'react'
import ReactDOM from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from './providers/ThemeProvider'
import App from './App'
import './assets/main.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </ThemeProvider>
  </React.StrictMode>
)
