/**
 * The Data tab's words: what a dataset is, the two kinds, getting one ready,
 * and the ways to make one. Plain language, for students who have never
 * trained anything.
 */

export const DATA_INTRO = {
  title: 'Examples for a model to learn from',
  text: 'A dataset is a set of examples. Training changes a model\'s numbers so it behaves more like the examples, which a Modelfile can\'t do. There are two kinds: questions with the answers you want, for Train, and pairs of answers where one is marked better, for Prefer.',
}

/** The two kinds, as they appear on a dataset's card. */
export const KINDS = {
  chat: {
    group: 'to imitate',
    use: 'Train',
    about: 'Questions with the answers you want. Train teaches the model to answer like this.',
  },
  preference: {
    group: 'chosen vs rejected',
    use: 'Prefer',
    about: 'Pairs of answers to the same question, one marked better. Prefer teaches the model to lean toward the better one.',
  },
} as const

export const READY = {
  check:
    'Check reads every row and says which ones a model can\'t learn from: an empty answer, a missing question, a line that isn\'t a row at all.',
  count:
    'Count measures the text in tokens, the word pieces a model reads. Very long rows get cut off during training; this says how many there are.',
  split:
    'Split puts some rows aside. Training never sees them, so they become the test: if the model does well on rows it has never seen, it learned something rather than memorising. Train needs a split dataset.',
}

/** The ways to start a dataset, each with when to use it. */
export const MAKE = {
  import: {
    title: 'import a public collection',
    when: 'For lots of real examples at once: thousands of questions and answers people have written, with their license.',
  },
  raw: {
    title: 'bring in a book or a table',
    when: 'Material, not examples yet. A model can then write question-and-answer rows from its passages: choose a dataset and use "write more rows".',
  },
  empty: {
    title: 'start an empty dataset',
    when: 'To fill it yourself: write rows, have a model write them, or (for preference) collect pairs from what you asked in Chat.',
  },
}
