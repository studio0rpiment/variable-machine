import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import DreamRoom from './components/DreamRoom'
import { connect } from './lib/helper'
import './look/runner'
import './styles.css'

connect()

/** #room/<name>: a dream installation's room page, full screen, without the rest of the app. */
const room = /^#room\/([a-z0-9][a-z0-9._-]{0,63})$/.exec(location.hash)?.[1]
window.addEventListener('hashchange', () => {
  if (location.hash.startsWith('#room/') || room) location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {room ? <DreamRoom name={room} /> : <App />}
  </StrictMode>,
)
