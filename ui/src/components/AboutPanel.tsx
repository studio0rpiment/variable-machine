import { ABOUT_INTRO, ABOUT_TABS } from '../explain/about'

/**
 * More about the process: the long form of the Start map. Every tab with what
 * it does, what it takes, what it gives and where that leads, each a link.
 * Not a step on the path; a place to read.
 */
export default function AboutPanel() {
  return (
    <section className="panel about" aria-label="about the process">
      <header className="mf__intro">
        <h1 className="start__title">{ABOUT_INTRO.title}</h1>
        <p className="start__text">{ABOUT_INTRO.text}</p>
      </header>
      <ol className="about__tabs">
        {ABOUT_TABS.map((t) => (
          <li key={t.panel} className="about__tab">
            <a className="about__name" href={`#${t.panel}`}>
              {t.n && <span className="nav-step">{t.n}</span>} {t.panel}
            </a>
            <div className="about__body">
              <h2 className="about__title">{t.title}</h2>
              <p className="about__does">{t.does}</p>
              <dl className="about__io">
                <dt>takes</dt>
                <dd>{t.takes}</dd>
                <dt>gives</dt>
                <dd>{t.gives}</dd>
                <dt>leads to</dt>
                <dd>{t.next}</dd>
              </dl>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
