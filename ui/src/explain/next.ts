/**
 * What happens after training: the adapter has to become a model before it
 * can be used. Shown under Train and Prefer once a run finishes.
 */
export const NEXT = {
  title: 'Next: use your model',
  intro:
    'Training does not change the model you started from: that stays exactly as it was. From your data it learns a small set of changes, called an adapter, and keeps it apart. Your trained model is the two together: the original plus the adapter. Ollama runs whole models, not adapters, so the next step joins them. One press does all three:',
  steps: [
    { word: 'export', text: 'joins the adapter to a copy of the original: its changes are added into the copy\'s numbers, making one whole model. The original itself is not touched.' },
    { word: 'import', text: 'hands that copy to Ollama as a model of its own, under your adapter\'s name, stored at int8 (smaller, with nearly the same answers). Like a model you pulled, it is then there for Chat, the Modelfile tab, or any program that uses Ollama.' },
    { word: 'chat', text: 'opens Chat with the original on one side and yours on the other, so the first thing you do is compare them. Ask both the kind of questions your dataset has.' },
  ],
  note: 'Exporting takes a minute or more and some disk space, a copy of the model. The adapter stays as it is: you can export again, blend it on Merge, or share it.',
  /** Under the train command, before anything has run. */
  beforeTrain: 'Training leaves the original model as it is and learns an adapter from your data: a small set of changes. Original plus adapter is your trained model. When the run finishes, a next step appears here that joins them into one model you can chat with.',
}
