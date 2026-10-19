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
  'panel.start': {
    title: 'Start',
    text: 'The map of the whole app: the order the tabs run in, and the three ways to change a model (imitate, prefer and blend), each explained in plain words. Start here if you are new.',
  },
  'panel.train': {
    title: 'Train · imitate',
    text: 'The first of the three ways to change a model. Training shows the model your examples over and over and nudges its numbers so its answers come out more like them. It does not rewrite the whole model: it learns a small add-on, called an adapter, that sits on top. The solid line on the chart is how far off the model still is on your examples, and it should fall. The dashed line is the examples you set aside. If it starts rising while the solid line keeps falling, the model is memorising your examples rather than learning from them.',
  },
  'panel.prefer': {
    title: 'Prefer',
    text: 'The second of the three ways to change a model. Instead of showing the model the right answer, here you show it two answers and say which one you like better, and it learns to lean toward the kind you chose. The pairs come from your own conversations in Chat. Afterwards it is tested on pairs it never saw, to see whether it now favours the ones you would. Push it too hard and its answers can fall apart, which is worth seeing too.',
  },
  'panel.adapters': {
    title: 'Adapters',
    text: 'An adapter is what each of the three ways leaves behind: a small file of changes that only works on top of the model it started from. Here you fold an adapter into its model and hand the result to Ollama, so it becomes a model you can chat with next to the original and hear what changed. Adapters are small, which also makes them the easiest thing to share.',
  },
  'panel.merge': {
    title: 'Merge · blend',
    text: 'The third of the three ways to change a model. Merging blends two adapters that were trained on the same starting model into a third one. The slider sets the mix: all of A at one end, all of B at the other, an even blend in the middle. What the blend does is not always halfway between the two. Chatting with all three side by side is how you find out.',
  },
  'panel.chat': {
    title: 'Chat',
    text: 'Type one question and two to four models answer it at the same time, side by side. This is where you compare: the original and what you made of it, two different models, or a series of blends. Each answer also appears in the terminal below as the command that produced it, and every conversation is saved, so the answers you liked can become training data later.',
  },
  'panel.share': {
    title: 'Share',
    text: 'Everything you make here is a folder: a dataset, an adapter, a training run. Sharing means zipping that folder so someone else can open exactly what you made, along with its record of where it came from. Download a zip to send it, or add a zip someone sent you and it goes back to where it belongs.',
  },
  /* ---- Models ---- */
  'models.pull': {
    title: 'Download this model',
    text: 'Downloads the model into Ollama so it can run on this computer. The line shows the exact command, and clicking it runs that command in the terminal below. Progress shows on the card and in the terminal. Models are big: from a few hundred megabytes to several gigabytes.',
  },
  'models.chat': {
    title: 'Chat with it',
    text: 'Opens Chat with this model in the second column, next to whatever is in the first.',
  },
  'models.modelfile': {
    title: 'Its recipe card',
    text: 'Opens this model\'s Modelfile, the short text that says which weights to load and how to use them, so you can make a variant of it.',
  },
  'models.rm': {
    title: 'Remove',
    text: 'Deletes the model from Ollama to free disk space. It asks first. You can download it again later, and anything you made from it stays where it is.',
  },
  /* ---- Modelfile ---- */
  'modelfile.startFrom': {
    title: 'Start from',
    text: 'The model your variant is based on. Its weights stay exactly as they are: you are only changing the instructions that travel with them.',
  },
  'modelfile.create': {
    title: 'Make the variant',
    text: 'Saves the text as a file and asks Ollama to make a new model from it, under the name above. It takes seconds, because no weights are copied or changed: the new model uses the same numbers with new instructions.',
  },
  'modelfile.chat': {
    title: 'Try it',
    text: 'Opens Chat with the variant you just made, so you can ask it something and compare it with the original.',
  },
  /* ---- Data ---- */
  'data.import': {
    title: 'Import',
    text: 'Copies examples from a public collection into a new dataset here. The license is read from the source while it downloads and written into the dataset\'s record, so you always know the terms.',
  },
  'data.raw': {
    title: 'Fetch raw material',
    text: 'Downloads a book or a table and cuts it into passages. These are not training examples yet. They are material you can ask a model to write examples from, further down this screen.',
  },
  'data.new': {
    title: 'Start an empty dataset',
    text: 'Makes a new, empty dataset to fill yourself. "chat" holds questions with the answers you want. "preference" holds pairs of answers where you say which one is better, for the Prefer screen.',
  },
  'data.validate': {
    title: 'Check for mistakes',
    text: 'Checks that every example is in the shape training needs: a question and an answer, with nothing empty. If something is wrong, it says which line.',
  },
  'data.count': {
    title: 'Count',
    text: 'Estimates how much text there is in tokens, the word pieces a model reads. Examples longer than the limit get cut off during training, and this tells you how many there are.',
  },
  'data.split': {
    title: 'Set some aside',
    text: 'Puts a share of your examples to one side, where training never sees them. They are the test: if the model does well on these, it learned something rather than memorising. The slider sets how many.',
  },
  'data.generate': {
    title: 'Write new examples',
    text: 'Asks a model to write new examples in the style of yours, or from the passage above if you picked one. They appear one by one below. Nothing is added to your dataset until you keep it.',
  },
  'data.keep': {
    title: 'Keep',
    text: 'Adds this example to the dataset, with a note saying which model wrote it. Edit the text first if you want to fix it.',
  },
  'data.reject': {
    title: 'Reject',
    text: 'Throws this example away. Nothing is saved.',
  },
  'data.rule': {
    title: 'Pair them all',
    text: 'For every question both models answered in Chat, makes a pair with the first model\'s answer marked as the one you prefer. Pairs already in the set are skipped.',
  },
  'data.chosen': {
    title: 'The better answer',
    text: 'Marks this answer as the one you prefer. Mark another as rejected, then add the pair.',
  },
  'data.rejected': {
    title: 'The worse answer',
    text: 'Marks this answer as the one you would rather the model did not give.',
  },
  /* ---- Train ---- */
  'train.base': {
    title: 'Starting model',
    text: 'The model training starts from. Training adds to it, and the original is never changed. The smaller one is quicker and fits on any 16GB Mac.',
  },
  'train.data': {
    title: 'Examples',
    text: 'The dataset to learn from. Only datasets with some examples set aside appear here, because those are how training checks itself.',
  },
  'train.type': {
    title: 'Kind of training',
    text: 'LoRA learns a small add-on and is the usual choice. DoRA is a variation that can learn a little more for about the same cost. Full changes every number in the model: it is the slowest, needs the most memory, and makes a whole new model rather than an add-on.',
  },
  'train.rank': {
    title: 'Rank',
    text: 'How big the add-on is. A higher rank can pick up finer habits, but it takes more memory and can memorise more easily.',
  },
  'train.layers': {
    title: 'Layers',
    text: 'A model is a stack of layers. This is how many of them get an add-on, counting from the top. More layers means more change and more memory.',
  },
  'train.lr': {
    title: 'Learning rate',
    text: 'How big each nudge is. Too small and nothing changes; too big and the model forgets what it knew. 1e-4 means 0.0001.',
  },
  'train.iters': {
    title: 'Iterations',
    text: 'How many nudges in total. Each one looks at a small batch of your examples. 200 is a good start for a few hundred examples.',
  },
  'train.batch': {
    title: 'Batch',
    text: 'How many examples each nudge looks at. Bigger is steadier but needs more memory. With the larger model on a 16GB Mac, use 1.',
  },
  'train.maxSeq': {
    title: 'Longest example',
    text: 'The longest example, in word pieces, the model will read. Anything longer is cut off. A higher limit needs more memory.',
  },
  'train.evalEvery': {
    title: 'Check every',
    text: 'How often training tests itself on the examples you set aside. Those tests are the dashed line on the chart.',
  },
  'train.run': {
    title: 'Start training',
    text: 'Starts training with exactly these settings. Ollama\'s models are put away first to free memory. Every step and its output appear in the terminal, and everything is saved in a folder under runs.',
  },
  'train.stop': {
    title: 'Stop',
    text: 'Stops training partway. A stopped run does not leave an adapter you can export, so start it again to finish.',
  },
  /* ---- Prefer ---- */
  'prefer.model': {
    title: 'Starting model',
    text: 'The model to tune. It can be an original or one you already trained and exported (a "fused" model).',
  },
  'prefer.data': {
    title: 'Preference pairs',
    text: 'Pairs of answers where you said which one is better. Build them in the Data screen from your Chat conversations. Some pairs are set aside to test with.',
  },
  'prefer.beta': {
    title: 'Beta',
    text: 'How far the model may move from where it started. A smaller number lets it change more.',
  },
  'prefer.iters': {
    title: 'Iterations',
    text: 'How many nudges toward the answers you preferred. More is not always better: push too far and the answers fall apart.',
  },
  'prefer.lr': {
    title: 'Learning rate',
    text: 'How big each nudge is. 2e-5 (0.00002) is a careful start. Raise it and the change comes faster, until the answers start to collapse.',
  },
  'prefer.run': {
    title: 'Start',
    text: 'Starts preference training with these settings. Afterwards it tests the pairs you set aside and shows how often the model now favours the answer you chose, before and after.',
  },
  /* ---- Adapters ---- */
  'adapters.quantize': {
    title: 'How Ollama stores it',
    text: 'int8 keeps the model close to the original at about half the size. int4 is smaller again but a little rougher. fp16 keeps it exactly as it is, at full size.',
  },
  'adapters.export': {
    title: 'Make it chattable',
    text: 'Folds the adapter into its model, then gives the result to Ollama as a new model you can chat with. It takes a few seconds.',
  },
  'adapters.chat': {
    title: 'Compare',
    text: 'Opens Chat with the original model in one column and this one in the next, so you can hear the difference.',
  },
  'adapters.register': {
    title: 'Give it to Ollama',
    text: 'This model is already folded together. Registering hands it to Ollama so you can chat with it.',
  },
  /* ---- Merge ---- */
  'merge.a': {
    title: 'Adapter A',
    text: 'One of the two adapters to blend. Its share is 1 minus the slider.',
  },
  'merge.b': {
    title: 'Adapter B',
    text: 'The other adapter. Only adapters trained on the same model with the same settings can be blended, so the list shows just those.',
  },
  'merge.t': {
    title: 'The mix',
    text: 'All of A at the left, all of B at the right, an even blend in the middle. Try a few points along the way and compare them in Chat.',
  },
  'merge.run': {
    title: 'Blend',
    text: 'Makes the blend, number by number, and saves it as a new adapter. Export it from its card below to chat with it.',
  },
  'merge.chat': {
    title: 'Compare all three',
    text: 'Opens Chat with A, B and the blend side by side, so you can hear whether the blend really sits between them.',
  },
  /* ---- Chat ---- */
  'chat.model': {
    title: 'Which model',
    text: 'The model that answers in this column. Change it at any time. Earlier answers stay where they are.',
  },
  'chat.addColumn': {
    title: 'Another column',
    text: 'Adds a column, up to four, so more models can answer the same question side by side.',
  },
  'chat.send': {
    title: 'Ask',
    text: 'Sends your question to every column at once. Each answer streams in as it is written, and each exchange is saved in the chat log.',
  },
  /* ---- Share ---- */
  'share.zip': {
    title: 'Zip',
    text: 'Packs this folder, with its record of where it came from, into one zip file you can send to someone.',
  },
  'share.download': {
    title: 'Download',
    text: 'Saves the zip through your browser, usually into Downloads, ready to send.',
  },
  'share.unzip': {
    title: 'Unzip',
    text: 'Unpacks a zip someone sent you and puts it back where it belongs. It checks the zip first and never overwrites anything you already have.',
  },
  'share.upload': {
    title: 'Add a zip',
    text: 'Choose a zip someone sent you. It goes into the shared folder, and you unzip it from its card.',
  },
} satisfies Record<string, Explanation>

export type ExplainId = keyof typeof EXPLAIN
