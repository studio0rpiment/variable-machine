import { createRoot } from 'react-dom/client'
import FlowMap from '../components/FlowMap'
import './map.generated.css'
import './map.css'

/**
 * The Start map on the website (variablemachine.orpiment.studio): the app's own
 * component, with its flags, zoom and highlighting, but no app behind it, so the
 * echo shows what each tab runs rather than a live terminal. A box leads to that
 * tab's description further down the page, and a plain scroll scrolls the page.
 */
createRoot(document.getElementById('map')!).render(<FlowMap pageScroll idle={[]} linkTo={(id) => `#tab-${id}`} />)
