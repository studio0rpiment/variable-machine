/**
 * "More about the process": every tab, what it does, what goes in, what comes
 * out and where that leads. The Start tab draws the same thing as a map; this
 * is the long form, in plain words.
 */

export const ABOUT_INTRO = {
  title: 'More about the process',
  text: 'A language model is a large file of numbers learned from text. You cannot edit those numbers by hand, but you can change what the model does in two kinds of ways: with words placed in front of it (a Modelfile), or by showing it examples until its numbers move (training). Each tab below does one part of that. What one tab makes, the next one uses; Chat is where you hear the result, and you can go there after any step.',
}

export interface AboutTab {
  panel: string
  /** the step number on the tab, if it has one */
  n?: string
  title: string
  does: string
  takes: string
  gives: string
  next: string
}

export const ABOUT_TABS: AboutTab[] = [
  {
    panel: 'models',
    n: '1',
    title: 'Models: what you start from',
    does: 'Lists the models on this computer and a small library to download from, each with what it was built for, who made it, its size and its license. It also lists the models training can start from.',
    takes: 'Nothing: this is where things begin.',
    gives: 'A model, ready to chat with or to change.',
    next: 'Chat, to hear it as it is. Modelfile, to change it with words. Train, Prefer and Merge, to change its numbers.',
  },
  {
    panel: 'modelfile',
    n: '2',
    title: 'Modelfile: change it with words',
    does: 'Puts standing instructions, a temperature and an example in front of a model, and saves the result as a variant. No training, no new numbers: the same model reading a note before every question. It shows how far words alone can go.',
    takes: 'A model from Models (or one you trained).',
    gives: 'A variant: a new name in Ollama that is the old model plus your words.',
    next: 'Chat, or the comparison right on the tab.',
  },
  {
    panel: 'data',
    n: '3',
    title: 'Data: examples to learn from',
    does: 'Gathers examples: from public collections, Hugging Face, an open-data table, your own file, a book, or answers you chose in Chat. Checks them, counts them, and sets some aside as the test.',
    takes: 'Collections, tables and files from outside; your chat log.',
    gives: 'A dataset: questions with the answers you want (for Train), or pairs of a better and a worse answer (for Prefer).',
    next: 'Train or Prefer.',
  },
  {
    panel: 'train',
    n: '4',
    title: 'Train: imitate',
    does: 'Shows a model your examples over and over until its answers come out like them. The model itself is not changed: training learns an adapter, a small set of changes kept apart from it. The loss chart shows how it went, on the rows it practised and on the rows set aside.',
    takes: 'A dataset to imitate, and a model to start from.',
    gives: 'An adapter. The model plus the adapter is your trained model.',
    next: 'Its next step exports it and opens Chat; Adapters keeps it.',
  },
  {
    panel: 'prefer',
    n: '4',
    title: 'Prefer: lean toward the better answer',
    does: 'Shows a model pairs of answers to the same question, one marked better, and nudges it toward the kind you chose. A way to shape a taste (shorter, kinder, plainer) without writing perfect answers yourself.',
    takes: 'A chosen-vs-rejected dataset, and a model to start from.',
    gives: 'An adapter, like Train.',
    next: 'Its next step exports it and opens Chat; Adapters keeps it.',
  },
  {
    panel: 'merge',
    n: '4',
    title: 'Merge: blend two adapters',
    does: 'Mixes two adapters trained on the same model into a third, with a slider for how much of each. No more training: a way to hear what lies between two changes.',
    takes: 'Two adapters from Adapters.',
    gives: 'A blend, which is an adapter too.',
    next: 'Adapters, to export it; then Chat.',
  },
  {
    panel: 'adapters',
    n: '5',
    title: 'Adapters: turn changes into models',
    does: 'Keeps everything the three ways made. Export joins an adapter to a copy of its model and hands the result to Ollama, so it can be used like any model. Try it asks the original and the trained model questions training never saw.',
    takes: 'Adapters from Train, Prefer and Merge.',
    gives: 'Models in Ollama, made by you.',
    next: 'Chat, Modelfile (words on top of training), Merge, or Share.',
  },
  {
    panel: 'chat',
    title: 'Chat: hear the difference',
    does: 'Puts models side by side and asks them the same question. Everything you ask is kept in a log, and two answers to the same question can become a pair for Prefer.',
    takes: 'Any model: pulled, a variant, or trained.',
    gives: 'Answers to compare, and a chat log.',
    next: 'Data, where pairs from the log become a preference set; or back to any step.',
  },
  {
    panel: 'share',
    title: 'Share: pass it on',
    does: 'Zips a dataset, an adapter, a blend or a run with its record of where it came from and its license, so someone else can unzip it into their own Variable Machine.',
    takes: 'Anything you made.',
    gives: 'A zip file, and from someone else, their work back in your tabs.',
    next: 'Whichever tab the unzipped work belongs to.',
  },
]
