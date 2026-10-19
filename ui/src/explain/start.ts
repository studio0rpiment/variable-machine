/**
 * The start screen's words: the path through the app, in the order of the tabs,
 * and the three ways to change a model's numbers (plan §2: imitate, prefer, blend).
 * Plain language, kept apart from the layout so it can be edited in one place.
 */

export const START_INTRO = {
  title: 'How to change a model',
  text: 'A language model is a large file of numbers learned from text. You cannot edit those numbers by hand, but you can change them by showing the model things. The tabs along the top run left to right in the order you would use them. You will come back to Chat after every step to hear what changed.',
}

export interface Step {
  panel: string
  title: string
  text: string
}

/** Before the numbers change: what to start from, and what to show it. */
export const BEFORE: Step[] = [
  {
    panel: 'models',
    title: 'Pick a model',
    text: 'Choose the model to start from and download it. Small ones are quick to change and fine for learning.',
  },
  {
    panel: 'modelfile',
    title: 'Change it without training',
    text: 'Every model carries a few instructions, such as a standing request to "answer in one sentence". Rewriting them changes how it behaves without touching a single number. Try this first: it shows how far you can get before any training at all.',
  },
  {
    panel: 'data',
    title: 'Collect examples',
    text: 'Training needs examples. Bring in a public set, ask a model to write some, or keep the best answers from your own conversations. Each example remembers where it came from.',
  },
]

/** The three ways to change the numbers. Each one leaves an adapter: a small add-on that sits on top of the model. */
export const THREE_WAYS: Step[] = [
  {
    panel: 'train',
    title: 'Imitate',
    text: 'Show the model examples of the answers you want, over and over, until it answers like them. This is training. It is the way to teach a voice, a format, or a subject.',
  },
  {
    panel: 'prefer',
    title: 'Prefer',
    text: 'Show the model two answers to the same question and say which one is better. It learns to lean toward the kind you chose. This is the way to shape a taste, such as shorter, kinder or plainer answers, without writing perfect examples yourself.',
  },
  {
    panel: 'merge',
    title: 'Blend',
    text: 'Mix two things the model has already learned into a third, with a slider for how much of each. No more training is needed. This is the way to find out what lies between two changes.',
  },
]

export const THREE_WAYS_NOTE = 'Each of the three ways leaves an adapter: a small add-on that sits on top of the model you started from.'

/** After: make it something you can talk to, compare it, pass it on. */
export const AFTER: Step[] = [
  {
    panel: 'adapters',
    title: 'Make it a model',
    text: 'Fold an adapter into its model and hand the result to Ollama, so you can talk to it.',
  },
  {
    panel: 'chat',
    title: 'Compare',
    text: 'Ask the original and what you made the same question, side by side. This is where you hear what changed.',
  },
  {
    panel: 'share',
    title: 'Share',
    text: 'Zip up what you made, with its record of where it came from, and send it to someone.',
  },
]
