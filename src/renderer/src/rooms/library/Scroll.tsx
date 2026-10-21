import type { Reading } from '../../../../shared/types'

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

/** A reading from the Records, unrolled. */
export function Scroll({ reading: r }: { reading: Reading }): React.JSX.Element {
  return (
    <article className="scroll">
      <span className="scroll-rod top" aria-hidden />
      <div className="scroll-sheet pixel-scroll">
        <h2>{r.title}</h2>
        <time dateTime={r.createdAt}>{formatDate(r.createdAt)}</time>
        <p className="scroll-question">{r.question}</p>
        <div className="scroll-body serif">
          {r.body.split(/\n{2,}/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      </div>
      <span className="scroll-rod bottom" aria-hidden />
    </article>
  )
}
