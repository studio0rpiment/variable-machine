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

/** The two ways to bring in a dataset found elsewhere. */
export const BRING = {
  hf: {
    title: 'a dataset from Hugging Face, by its name',
    when: 'Found one on huggingface.co/datasets? Copy its name (like databricks/databricks-dolly-15k) and paste it here. Its columns are read and its license is recorded.',
  },
  file: {
    title: 'your own file',
    when: 'A table (.csv) or a .jsonl or .json file: from Kaggle (kaggle.com/datasets), an open-data portal, a teacher, a spreadsheet you wrote. Say what license it came with; for your own writing, "mine".',
  },
}

/** How to find a dataset worth training on: the guide in "make a new one". */
export const FIND_GUIDE: { title: string; text: string }[] = [
  {
    title: 'Where to look',
    text: 'Hugging Face (huggingface.co/datasets) has hundreds of thousands of datasets, most of them ready to bring in by name. Kaggle (kaggle.com/datasets) has tables you download as .csv. Project Gutenberg (gutenberg.org) has public-domain books. Open-data portals have tables of public facts: data.gov for the United States, opendata.dc.gov for Washington DC, and most cities and states have one. Books and tables are raw material: a model writes question-and-answer rows from them. And your own writing: a spreadsheet with a question column and an answer column is a dataset.',
  },
  {
    title: 'Searching Hugging Face',
    text: 'On huggingface.co/datasets, filter by Tasks (Question Answering, Text Generation), by Languages, and by Licenses. Sort by Most downloads to find ones others have trusted. Open one and look at the Dataset Viewer: it shows the columns and a few rows, so you can see what a model would learn before bringing it in.',
  },
  {
    title: 'What makes a good one',
    text: 'Rows that look like what you want the model to do: if you want short, kind answers, the answers in the data should be short and kind, because the model will copy them. A few hundred good rows teach more than thousands of mixed ones. Check the columns: a question and an answer (for Train), or a question with a better and a worse answer (for Prefer).',
  },
  {
    title: 'The license',
    text: 'Every dataset comes with terms. CC0 and public domain: anything goes. CC BY, MIT, Apache: use and share, crediting the source. CC BY-SA: what you share must carry the same license. NC (non-commercial): fine for class, not for selling. No license stated: you don\'t have permission yet; ask, or find another. The app records the license with every dataset and passes it on to what you make from it.',
  },
  {
    title: 'What not to use',
    text: 'Anything with people\'s private information: names with addresses, health, grades, messages. Anything copied from a site whose terms forbid it. Anything you would not want a model to repeat, because it will.',
  },
  {
    title: 'Shapes the app reads',
    text: 'For Train: two columns, such as question/answer, instruction/response, prompt/completion or input/output; or a "messages" list. For Prefer: three columns, prompt/chosen/rejected. Column names are matched loosely ("Question" and "question_text" both work). If yours are named differently, rename them in a spreadsheet first.',
  },
]
