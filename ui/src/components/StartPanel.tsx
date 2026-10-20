import FlowMap from './FlowMap'

/**
 * Start: the map, and nothing else. Every tab is a node; the wires say what
 * one passes to the next. Clicking a node opens its tab. The long form, in
 * words, is the About tab.
 */
export default function StartPanel() {
  return (
    <section className="panel start" aria-label="start">
      <FlowMap />
    </section>
  )
}
