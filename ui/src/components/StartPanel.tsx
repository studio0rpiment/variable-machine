import FlowMap from './FlowMap'
import { START_INTRO } from '../explain/start'

/**
 * Start: the map. Every tab is a node; the wires say what one passes to the
 * next. Clicking a node opens its tab. The long form, in words, is the About tab.
 */
export default function StartPanel() {
  return (
    <section className="panel start" aria-label="start">
      <header className="start__intro">
        <h1 className="start__title">{START_INTRO.title}</h1>
        <p className="start__text">
          {START_INTRO.text}{' '}
          <a href="#about" className="text-link">
            More about the process
          </a>
        </p>
      </header>
      <FlowMap />
    </section>
  )
}
