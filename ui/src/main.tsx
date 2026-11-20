import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import LatentRoom from './components/LatentRoom'
import { connect } from './lib/helper'
import './look/runner'
import './styles.css'

connect()

/** #latent-room/<name>: the latent image's room, the installation's own page, full screen, without the rest of the app. */
const latentRoom = /^#latent-room\/([a-z0-9][a-z0-9._-]{0,63})$/.exec(location.hash)?.[1]
window.addEventListener('hashchange', () => {
  if (location.hash.startsWith('#latent-room/') || latentRoom) location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {latentRoom ? <LatentRoom name={latentRoom} /> : <App />}
  </StrictMode>,
)
