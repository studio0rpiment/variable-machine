/**
 * The Modelfile tab's words: what the tab is for, what each field does, and
 * what each kind of line in a Modelfile means. Plain language, kept apart
 * from the layout.
 */

export const MODELFILE_INTRO = {
  title: 'Change how a model behaves, with words only',
  text: 'Give a model SYSTEM instructions, a TEMPERATURE setting for how adventurous it is, and a MESSAGE example with a question and answer to imitate. No training happens and no numbers change: the new model, a variant, uses exactly the same weights as the original, plus your words.',
}

export const SIZE_NOTE =
  'Size matters here. Small models follow instructions loosely: smollm2:360m often ignores them, especially long ones. Bigger models such as qwen3:4b and llama3.2:3b follow them closely. Try the same preset on two sizes and compare.'

export const FIELDS = {
  instructions: {
    title: 'Instructions',
    line: 'SYSTEM',
    text: 'Standing instructions the model reads before every conversation, as if someone whispered them before each question. Say what to do plainly: the kind of answer, the voice, the length, what to avoid.',
  },
  temperature: {
    title: 'How adventurous',
    line: 'PARAMETER temperature',
    text: 'At each word, the model picks from the words it thinks could come next. Temperature is how freely it picks. Low (0.1) means it nearly always takes the most likely word: careful and plain. Around 1.3 it often takes unlikely ones: surprising. Past about 1.5 it falls apart into nonsense. A PARAMETER is a setting line, and temperature is the one worth playing with.',
  },
  openChoice: {
    title: 'Let it pick from any word',
    line: 'PARAMETER top_k and top_p',
    text: 'Normally the model may only choose among the likeliest words (the 40 most likely, and only those that make up 90% of the chance). That keeps even a high temperature tame. Switch this on to let it pick from every word, and the temperature really shows.',
  },
  example: {
    title: 'Example to imitate',
    line: 'MESSAGE',
    text: 'One made-up exchange: a question and the answer you would want. The model sees it as if it had happened earlier in the conversation, so it copies its shape. Small models often follow an example better than they follow instructions.',
  },
} as const

export interface LineKind {
  word: string
  weights: boolean
  text: string
}

/** Every kind of line a Modelfile can have, for the folded "What the lines mean" section. */
export const LINE_KINDS: LineKind[] = [
  { word: 'FROM', weights: true, text: 'Which model to start from: the weights, the numbers it learned. A variant always keeps this the same.' },
  { word: 'SYSTEM', weights: false, text: 'Standing instructions, read before every conversation.' },
  { word: 'PARAMETER', weights: false, text: 'A setting for how it writes. temperature is how adventurous it is; top_k and top_p limit which words it may choose from; stop marks where an answer ends (leave those as they are).' },
  { word: 'MESSAGE', weights: false, text: 'A made-up exchange it sees as if it had already happened, so it copies the pattern. They come in pairs: user, then assistant.' },
  { word: 'TEMPLATE', weights: false, text: 'How a conversation is laid out for this model behind the scenes. Inherited from the model you start from; best left alone.' },
  { word: 'LICENSE', weights: false, text: 'The terms of use, carried along with the weights. Inherited too.' },
  { word: 'ADAPTER', weights: true, text: 'An add-on of learned numbers laid on top of the weights. Only training makes these, never this tab.' },
]
