/**
 * The explanation layer's words. Plain language: written for someone who has
 * never trained a model, and kept apart from the components so the text can
 * be read and edited in one place. Keys name the element a flag points at;
 * later flags (buttons, fields, the terminal) join this list.
 */
export interface Explanation {
  title: string
  text: string
}

export const EXPLAIN = {
  'panel.models': {
    title: 'Models',
    text: 'A model is the thing that answers when you type to it: a large file of numbers learned from text, packaged so it can run on your computer. This screen lists two kinds. "Runs on" models live in Ollama, the program that runs them here, and they are the ones you can chat with. "Trains on" models are starting points you can teach new habits to. Each card shows the model\'s license, which says what you are allowed to do with it, and the library at the bottom lets you download more.',
  },
  'panel.modelfile': {
    title: 'Modelfile',
    text: 'Every model comes with a short recipe card, the Modelfile, that says which numbers to load and how to use them. Only the FROM line points at the model itself: its weights, the numbers that hold what it learned. The other lines change how it behaves without changing what it knows. SYSTEM is a standing instruction it reads before every conversation, and temperature is how adventurous its word choices are. Edit the card, save it under a new name, and you have a variant to compare with the original in Chat.',
  },
  'panel.data': {
    title: 'Data',
    text: 'Training data is a pile of examples: a question, and the answer you would like the model to give. Here you collect them. Bring in a public set, start from one of the examples, or ask a model to write new ones from a book or a table and keep only the ones you like. You also check them for mistakes and set a few aside to test with later. Every set keeps a record of where each example came from and the license it came with, so you always know whose words these are.',
  },
  'panel.train': {
    title: 'Train',
    text: 'Training shows the model your examples over and over and nudges its numbers so its answers come out more like them. It does not rewrite the whole model: it learns a small add-on, called an adapter, that sits on top. The solid line on the chart is how far off the model still is on your examples, and it should fall. The dashed line is the examples you set aside. If it starts rising while the solid line keeps falling, the model is memorising your examples rather than learning from them.',
  },
  'panel.prefer': {
    title: 'Prefer',
    text: 'Instead of showing the model the right answer, here you show it two answers and say which one you like better, and it learns to lean toward the kind you chose. The pairs come from your own conversations in Chat. Afterwards it is tested on pairs it never saw, to see whether it now favours the ones you would. Push it too hard and its answers can fall apart, which is worth seeing too.',
  },
  'panel.adapters': {
    title: 'Adapters',
    text: 'An adapter is what training leaves behind: a small file of changes that only works on top of the model it was trained on. Here you fold an adapter into its model and hand the result to Ollama, so it becomes a model you can chat with next to the original and hear what changed. Adapters are small, which also makes them the easiest thing to share.',
  },
  'panel.merge': {
    title: 'Merge',
    text: 'Merging blends two adapters that were trained on the same starting model into a third one. The slider sets the mix: all of A at one end, all of B at the other, an even blend in the middle. What the blend does is not always halfway between the two. Chatting with all three side by side is how you find out.',
  },
  'panel.chat': {
    title: 'Chat',
    text: 'Type one question and two to four models answer it at the same time, side by side. This is where you compare: the original and what you made of it, two different models, or a series of blends. Each answer also appears in the terminal below as the command that produced it, and every conversation is saved, so the answers you liked can become training data later.',
  },
  'panel.share': {
    title: 'Share',
    text: 'Everything you make here is a folder: a dataset, an adapter, a training run. Sharing means zipping that folder so someone else can open exactly what you made, along with its record of where it came from. Download a zip to send it, or add a zip someone sent you and it goes back to where it belongs.',
  },
} satisfies Record<string, Explanation>

export type ExplainId = keyof typeof EXPLAIN
