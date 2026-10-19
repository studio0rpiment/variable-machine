import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { connect } from './lib/helper'
import './styles.css'

connect()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
