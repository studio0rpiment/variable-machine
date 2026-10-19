import { Fragment } from 'react'

/** Web addresses written in plain text (huggingface.co/datasets, data.gov …), found so they can be links. */
const ADDRESS = /\b((?:[a-z0-9-]+\.)+(?:gov|org|com|co|io|edu|net)(?:\/[\w./-]*[\w/])?)/gi

/**
 * Explanation text with its web addresses made into links that open in a new
 * tab, so the guide's "where to look" can be followed with a click. The text
 * itself stays plain, as written in explain/*.ts.
 */
export function Linked({ text }: { text: string }) {
  const parts = text.split(ADDRESS)
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <a key={i} href={`https://${p}`} target="_blank" rel="noopener noreferrer" className="text-link">
            {p}
          </a>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  )
}
