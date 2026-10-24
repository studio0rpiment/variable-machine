# The explanation flags

Every flag that opens when you point at a tab name or a control, in one place. Edit the words here: `npm run dev` rebuilds the page when you save, and you see the change when you reload it. `npm run build` does the same once.

Each flag is:

- a `###` line with its **title**, the bold words at the top of the flag;
- on the next line, its **name** in backticks, which ties it to the control it explains. Don't change the name;
- then its **text**, one paragraph (line breaks inside it become spaces).

The `##` sections are only for finding your way; they are not shown.

## The tabs

### Models
`panel.models`

A model is the thing that answers when you type to it: a large file of numbers learned from text, packaged so it can run on your computer. This screen lists the language models (they write: text in, text out) and, at the bottom, the image tools (they look). For the language models there are two lists. "Runs on" models live in Ollama, the program that runs them here, and they are the ones you can chat with. "Trains on" models are starting points you can teach new habits to. Each card shows the model's license, which says what you are allowed to do with it, and the library at the bottom lets you download more.

### Modelfile
`panel.modelfile`

Change how a model behaves using only words: standing instructions, how adventurous it is, and an example to imitate. No training, and the weights stay exactly the same. Pick a preset or write your own, make the variant, and see its answer next to the original right on this screen. Behind it is a short file, the Modelfile, which you can open to see what each line does.

### Data
`panel.data`

Training data is a pile of examples: a question, and the answer you would like the model to give. Here you collect them. Bring in a public set, start from one of the examples, or ask a model to write new ones from a book or a table and keep only the ones you like. You also check them for mistakes and set a few aside to test with later. Every set keeps a record of where each example came from and the license it came with, so you always know whose words these are.

### Start
`panel.start`

A map of the whole app, read from left to right: what you bring, preparing it, how a model learns, making it a model, using it. The top band is the language models, the ones you change. Below, one row for each other kind: image segmentation and speech, whose makers trained them, and gesture, which you train yourself in seconds. Each line is what one step passes to the next. Click a box to open its tab. Start here if you are new.

### About the process
`panel.about`

The long form of the map, in words: every tab with what it does, what it takes, what it gives and where that leads. Not a step on the path; a place to read.

### Train · imitate
`panel.train`

The first of the three ways to change a model. Training shows the model your examples over and over and nudges its numbers so its answers come out more like them. It leaves the model itself as it was and learns a small set of changes, called an adapter, kept apart from it. The solid line on the chart is how far off the model still is on your examples, and it should fall. The dashed line is the examples you set aside. If it starts rising while the solid line keeps falling, the model is memorising your examples rather than learning from them.

### Prefer
`panel.prefer`

The second of the three ways to change a model. Instead of showing the model the right answer, here you show it two answers and say which one you like better, and it learns to lean toward the kind you chose. The pairs come from your own conversations in Chat. Afterwards it is tested on pairs it never saw, to see whether it now favours the ones you would. Push it too hard and its answers can fall apart, which is worth seeing too.

### Adapters
`panel.adapters`

An adapter is what each of the three ways leaves behind: a small file of changes that only works on top of the model it started from. The original model stays as it was; original plus adapter is your trained model. Here export joins the two into one model and hands it to Ollama, so you can chat with it next to the original and hear what changed. Adapters are small, which also makes them the easiest thing to share.

### Merge · blend
`panel.merge`

The third of the three ways to change a model. Merging blends two adapters that were trained on the same starting model into a third one. The slider sets the mix: all of A at one end, all of B at the other, an even blend in the middle. What the blend does is not always halfway between the two. Chatting with all three side by side is how you find out.

### Chat
`panel.chat`

Type one question and two to four models answer it at the same time, side by side. This is where you compare: the original and what you made of it, two different models, or a series of blends. Each answer also appears in the terminal below as the command that produced it, and every conversation is saved, so the answers you liked can become training data later.

### Share
`panel.share`

Everything you make here is a folder: a dataset, an adapter, a training run. Sharing means zipping that folder so someone else can open exactly what you made, along with its record of where it came from. Download a zip to send it, or add a zip someone sent you and it goes back to where it belongs.

## The Start map

### Your words
`map.words`

What you bring to a language model: questions with the answers you want, written by you or brought in from a table, a book or a public collection. On the Data tab they become rows, the examples Train learns from.

### Photos + words
`map.pictures`

Photos, each with a question and the answer you want: what it shows, said your way. On the Data tab they become picture rows, and Train teaches a model that sees (SmolVLM) to talk about pictures like that.

### Your photos
`map.photos`

An image set: your photos, with whose they are. Image segmentation finds the regions in them (the object that stands out, how far away each part is, the blob you click); the same photos can also become picture rows on the Data tab.

### Words, voice
`map.voice`

Text you want read aloud, or a recording of your voice. One model speaks the text; another writes down what it hears in the recording.

### Your movements
`map.movements`

Your hand or your body in front of the camera. Only the points the tracker finds are kept, never the picture: a few seconds of each gesture you want it to know.

### Made by others
`map.made`

A model you use as it is: its makers trained it, on their own photos or recordings, and you download it from the Models tab. Its card there says who made it, what it was trained on and its license. You don't change it; you use it on your own material.

### Train a gesture model
`map.gestureTrain`

Training in seconds: your recorded examples are kept, and a new pose is named by the examples nearest to it (k-nearest neighbours). What it learns is exactly what you showed it, and nothing else.

## Models

### Get
`models.get`

This model is not in Ollama's library, so it can't be pulled. Get downloads its two files from Hugging Face (the language model, and the projector that turns a picture into its tokens) into workspace/tools, writes a Modelfile naming both, and runs ollama create.

### Download this model
`models.pull`

Downloads the model into Ollama so it can run on this computer. The line shows the exact command, and clicking it runs that command in the terminal below. Progress shows on the card and in the terminal. Models are big: from a few hundred megabytes to several gigabytes.

### Chat with it
`models.chat`

Opens Chat with this model in the second column, next to whatever is in the first.

### Its recipe card
`models.modelfile`

Opens this model's Modelfile, the short text that says which weights to load and how to use them, so you can make a variant of it.

### Remove
`models.rm`

Deletes the model from Ollama to free disk space. It asks first. You can download it again later, and anything you made from it stays where it is.

## Modelfile

### Start from
`modelfile.startFrom`

The model your variant is based on. Its weights stay exactly as they are; you are only adding words. Bigger models follow instructions more closely than small ones.

### Preset
`modelfile.preset`

A ready-made set of instructions, temperature and example that changes answers in an obvious way. Pick one to fill in the form, then change anything you like.

### Name
`modelfile.name`

What the variant will be called. It appears in the Models tab, inside the card of the model it was made from.

### Make the variant
`modelfile.create`

Saves your words as a Modelfile and asks Ollama to make a new model from it. It takes a second, because no weights are copied or changed: the new model uses the same numbers with your words added.

### Ask both
`modelfile.try`

Sends the same question to the original and to your variant, and shows both answers side by side, so you can see what your words changed.

### Keep talking
`modelfile.chat`

Opens Chat with the original and your variant side by side, for longer comparisons.

### Open
`modelfile.open`

Loads this variant back into the form, so you can change its words and make it again.

### Keep it
`modelfile.keep`

Variants you make here are temporary: when Variable Machine stops, they are removed so a class of experiments doesn't pile up on the computer. Keep the ones you want to come back to; they stay in Ollama and in workspace/modelfiles until you remove them yourself.

## Data

### Import
`data.import`

Copies examples from a public collection into a new dataset here. The license is read from the source while it downloads and written into the dataset's record, so you always know the terms.

### Fetch raw material
`data.raw`

Downloads a book or a table and cuts it into passages. These are not training examples yet. They are material you can ask a model to write examples from, further down this screen.

### Start an empty dataset
`data.new`

Makes a new, empty dataset to fill yourself. "chat" holds questions with the answers you want. "preference" holds pairs of answers where you say which one is better, for the Prefer screen.

### Choose a dataset
`data.choose`

Each card is one set of examples. "To imitate" sets teach a model to answer like their answers, on the Train tab; "chosen vs rejected" sets teach it to prefer one kind of answer, on the Prefer tab. Choose one to see what is in it and get it ready, or make a new one to bring in one you found.

### What is in it
`data.contents`

What the dataset is, one example row, how many rows it has and how many are set aside for testing, where the rows came from and the license they carry. The license passes on to anything you train with it.

### Get it ready
`data.ready`

Three checks before training, each a command you can see in the terminal. Check finds rows a model can't learn from. Count measures how long the rows are. Split sets some rows aside as the test. Training needs a split dataset; the other two are worth doing once.

### Use it
`data.use`

Takes you to another tab: Train for a dataset to imitate, Prefer for a chosen vs rejected one. That tab opens with this dataset already picked, ready to train. Come back to Data with the 3 · data tab at the top.

### Opens another tab
`data.useButton`

This leaves the Data tab and opens Train (or Prefer) with this dataset chosen. Nothing starts until you press the train line there.

### Add rows
`data.more`

More rows for this dataset. A model writes new ones in the style of the rows you already have (or from a book you brought in), and you keep the good ones. For a chosen vs rejected set, the pairs come from questions you asked two models in Chat.

### The rows
`data.rows`

Every row in the dataset, as training will read it: the question and the answer it should learn. "valid" shows the rows set aside for testing. Problems lists rows a model can't learn from.

### All datasets
`data.all`

Back to every dataset as cards, where you can choose another or make a new one.

### Search
`data.opendata`

Searches the portal's catalog for tables. Each result says who published it and its license; its title opens the dataset's page, where you can read more. Nothing downloads until you choose a table and bring it in.

### Make questions and answers
`data.template`

Fills your question and answer from each row of the table and saves them as a dataset, ready to check, split and train on. Rows with an empty blank (or a 0, if you said so) are left out, and so are repeated questions.

### Download the table
`data.getTable`

Fetches the whole table these rows were made from, straight from the portal that publishes it, with its license. Then you can write your own questions from it: other columns, other wording, more rows.

### Export, import, chat
`next.export`

Runs export: the adapter is folded into a copy of the model it was trained on, and Ollama imports that copy under your adapter's name. When it is done, Chat opens with the original and yours side by side.

### Bring it in from Hugging Face
`data.hf`

Reads rows from the dataset viewer on Hugging Face, works out which column is the question and which the answer, and makes them a dataset here. The license on the dataset card is recorded with it. The terminal says how it read the columns.

### Choose a file
`data.upload`

Copies a .csv, .jsonl or .json file from this computer into workspace/uploads. Nothing leaves the computer. Then "make it a dataset" reads its columns into rows.

### Describe it
`data.describe`

Your own words about what this dataset is and what a model would learn from it. It shows on the dataset's card and travels with it when you share it.

### Check for mistakes
`data.validate`

Checks that every example is in the shape training needs: a question and an answer, with nothing empty. If something is wrong, it says which line.

### Count
`data.count`

Estimates how much text there is in tokens, the word pieces a model reads. Examples longer than the limit get cut off during training, and this tells you how many there are.

### Set some aside
`data.split`

Puts a share of your examples to one side, where training never sees them. They are the test: if the model does well on these, it learned something rather than memorising. The slider sets how many.

### Write new examples
`data.generate`

Asks a model to write new examples in the style of yours, or from the passage above if you picked one. They appear one by one below. Nothing is added to your dataset until you keep it.

### Keep
`data.keep`

Adds this example to the dataset, with a note saying which model wrote it. Edit the text first if you want to fix it.

### Reject
`data.reject`

Throws this example away. Nothing is saved.

### Pair them all
`data.rule`

For every question both models answered in Chat, makes a pair with the first model's answer marked as the one you prefer. Pairs already in the set are skipped.

### The better answer
`data.chosen`

Marks this answer as the one you prefer. Mark another as rejected, then add the pair.

### The worse answer
`data.rejected`

Marks this answer as the one you would rather the model did not give.

## Train

### Starting model
`train.base`

The model training starts from. Training adds to it, and the original is never changed. The smaller one is quicker and fits on any 16GB Mac.

### Examples
`train.data`

The dataset to learn from. Only datasets with some examples set aside appear here, because those are how training checks itself.

### Kind of training
`train.type`

LoRA learns a small add-on and is the usual choice. DoRA is a variation that can learn a little more for about the same cost. Full changes every number in the model: it is the slowest, needs the most memory, and makes a whole new model rather than an add-on.

### Rank
`train.rank`

How big the add-on is. A higher rank can pick up finer habits, but it takes more memory and can memorise more easily.

### Layers
`train.layers`

A model is a stack of layers. This is how many of them get an add-on, counting from the top. More layers means more change and more memory.

### Learning rate
`train.lr`

How big each nudge is. Too small and nothing changes; too big and the model forgets what it knew. 1e-4 means 0.0001.

### Iterations
`train.iters`

How many nudges in total. Each one looks at a small batch of your examples. 200 is a good start for a few hundred examples.

### Batch
`train.batch`

How many examples each nudge looks at. Bigger is steadier but needs more memory. With the larger model on a 16GB Mac, use 1.

### Longest example
`train.maxSeq`

The longest example, in word pieces, the model will read. Anything longer is cut off. A higher limit needs more memory.

### Check every
`train.evalEvery`

How often training tests itself on the examples you set aside. Those tests are the dashed line on the chart.

### Start training
`train.run`

Starts training with exactly these settings. Ollama's models are put away first to free memory. Every step and its output appear in the terminal, and everything is saved in a folder under runs.

### Stop
`train.stop`

Stops training partway. A stopped run does not leave an adapter you can export, so start it again to finish.

## Prefer

### Starting model
`prefer.model`

The model to tune. It can be an original or one you already trained and exported (a "fused" model).

### Preference pairs
`prefer.data`

Pairs of answers where you said which one is better. Build them in the Data screen from your Chat conversations. Some pairs are set aside to test with.

### Beta
`prefer.beta`

How far the model may move from where it started. A smaller number lets it change more.

### Iterations
`prefer.iters`

How many nudges toward the answers you preferred. More is not always better: push too far and the answers fall apart.

### Learning rate
`prefer.lr`

How big each nudge is. 2e-5 (0.00002) is a careful start. Raise it and the change comes faster, until the answers start to collapse.

### Start
`prefer.run`

Starts preference training with these settings. Afterwards it tests the pairs you set aside and shows how often the model now favours the answer you chose, before and after.

## Adapters

### How Ollama stores it
`adapters.quantize`

int8 keeps the model close to the original at about half the size. int4 is smaller again but a little rougher. fp16 keeps it exactly as it is, at full size.

### Ask
`adapters.try`

Asks the original model and the trained one the same question, one after the other, and shows their answers next to the answer the dataset gives. The trained model should sound more like the data.

### Remove
`adapters.remove`

Moves this adapter to the Trash and removes the model exported from it from Ollama, to free the disk and start again. The run and its chart stay on the Train tab. You can put the adapter back from the Trash.

### Make it chattable
`adapters.export`

Folds the adapter into its model, then gives the result to Ollama as a new model you can chat with. It takes a few seconds.

### Compare
`adapters.chat`

Opens Chat with the original model in one column and this one in the next, so you can hear the difference.

### Give it to Ollama
`adapters.register`

This model is already folded together. Registering hands it to Ollama so you can chat with it.

## Merge

### Adapter A
`merge.a`

One of the two adapters to blend. Its share is 1 minus the slider.

### Adapter B
`merge.b`

The other adapter. Only adapters trained on the same model with the same settings can be blended, so the list shows just those.

### The mix
`merge.t`

All of A at the left, all of B at the right, an even blend in the middle. Try a few points along the way and compare them in Chat.

### Blend
`merge.run`

Makes the blend, number by number, and saves it as a new adapter. Export it from its card below to chat with it.

### Compare all three
`merge.chat`

Opens Chat with A, B and the blend side by side, so you can hear whether the blend really sits between them.

### Add the row
`data.picture`

Adds one row: the photo, the question and your answer. The photo is copied into the dataset folder, so the dataset is complete on its own, and its credit and license are written into the dataset's record.

### The answer you want
`data.pictureAnswer`

What a model that sees should say about this photo. Training learns the way you answer: how long, in what voice, what you notice first. Answer every photo the same way and the model will pick that way up.

## Chat

### Which model
`chat.model`

The model that answers in this column. Change it at any time. Earlier answers stay where they are.

### Another column
`chat.addColumn`

Adds a column, up to four, so more models can answer the same question side by side.

### A picture
`chat.picture`

Sends a picture with your question, from the photos in your image sets. Models that see (like SmolVLM) look at it and answer about it; models that only write get the words alone, and say so. The terminal shows it as --image and the file it is.

### Add a photo
`chat.pictureAdd`

Copies a photo from your computer into the chosen image set (or a new one called chat-photos), so the image segmentation tab and the Data tab can use it too. JPEG, PNG or WebP.

### Ask
`chat.send`

Sends your question to every column at once. Each answer streams in as it is written, and each exchange is saved in the chat log.

## Share

### Zip
`share.zip`

Packs this folder, with its record of where it came from, into one zip file you can send to someone.

### Download
`share.download`

Saves the zip through your browser, usually into Downloads, ready to send.

### Unzip
`share.unzip`

Unpacks a zip someone sent you and puts it back where it belongs. It checks the zip first and never overwrites anything you already have.

### Add a zip
`share.upload`

Choose a zip someone sent you. It goes into the shared folder, and you unzip it from its card.

## Image segmentation, speech, gesture

### Gesture
`panel.gesture`

Gesture recognition. A tracker finds points on your hand (21) or your body (33) in the camera picture, and a model you train yourself names the gesture they make. Record a few examples of two or more gestures, train (it takes a moment), test it live, and send what it sees as OSC to TouchDesigner, Max, Pure Data or anything else that listens. Everything runs in this page; only the points are kept, never the camera picture.

### Download the tracker
`move.get`

Downloads the tracker, one small file from Google's MediaPipe, into workspace/tools. It runs in this page. You don't train it: it finds the points, and your own model names the gesture.

### Gesture set
`move.set`

A set of your gestures, with the examples you recorded and the model trained on them, in workspace/gestures. A set follows hands or a body, not both.

### Make a set
`move.new`

Starts a new gesture set for hands or for a body. Then name a gesture and record some examples of it.

### Hold to record
`move.record`

While you hold the button, the shape of your hand (or body) is recorded ten times a second: the points, measured from the wrist (or hips), so the same gesture reads the same anywhere in the picture. Move a little while you hold it, so the examples vary: 20 to 50 of each gesture is plenty.

### Train
`move.train`

k-nearest neighbours: a new pose is compared with every example you recorded, and the 5 closest vote. Training keeps your examples, after checking it on every fifth one set aside. The grid shows the check: each gesture you made, down the side, and what it was named, across. Mistakes off the diagonal show which gestures look alike to it.

### Test it live
`move.test`

Names your gesture as you make it, and shows how many of the nearest examples agree. Try the gestures it mixes up, and record more examples of them.

### Send it on
`move.send`

While you test, every guess goes out as an OSC message to this computer on that port: the address /vm/<set>, then the gesture's name and how sure it is (0 to 1). In TouchDesigner use an OSC In CHAT/DAT, in Max udpreceive, in Pure Data netreceive -u -b. Nothing goes to any other computer.

### Speech
`panel.speech`

Speech synthesis and speech recognition: two kinds of model, used as they are: one that speaks (text in, a voice out) and one that listens (a recording in, what was said out). Type something and Soprano reads it aloud; record your voice and Qwen3-ASR writes down what it heard, in 52 languages and dialects. Both run on this computer, and the first use of each downloads it. Every sound is a WAV file in workspace/audio, with a record of where it came from and what was heard in it.

### Speak
`voice.speak`

Soprano reads the text aloud and saves it as a WAV file in workspace/audio/spoken. It has one voice, on purpose: it can't copy anyone's. Press listen on the result to hear what the listening model makes of it: a round trip from text to voice and back.

### Record
`voice.record`

Records your microphone in this page until you press again, then saves it as a WAV file in workspace/audio/recorded and has the listening model (Qwen3-ASR) write down what it heard straight away. The browser asks first. Nothing is sent anywhere.

### Listen
`voice.listen`

Qwen3-ASR writes down what it hears in this sound, in whichever language it hears. What it heard is saved next to the sound, and in the set's record.

### Image segmentation
`panel.segmentation`

Image segmentation: finding the regions of a picture. Cut something out, the distance between blobs, select a blob. A blob is early computer vision's word for a region of a picture that stands out from what surrounds it: an object, as the computer finds it. The tools are ready-made models you download once; you don't train them. They run inside this page, on your computer, and nothing is sent anywhere. Bring your photos into a set, pick one, and run a tool. What it makes is saved in workspace/outputs with a record of which photo and which model made it.

### Download this tool
`look.get`

Fetches the model's files from Hugging Face into workspace/tools, one file at a time, with curl. You can watch it in the terminal. You only do this once.

### Image set
`look.set`

A set is a folder of photos in workspace/images. Keep one set per project, so what you make from it stays together.

### Whose photos
`look.license`

Written into the set's record, and carried by everything made from it. If they are your own photos of your own work, leave it as it is. If they are someone else's, write whose, and under what license.

### Add photos
`look.photos`

Copies photos from your computer into the set. JPEG, PNG or WebP.

### The example photos
`look.example`

Four classic subjects of computer science, to try the tools on before your own: the rubber duck programmers explain their code to, a duck in a glass bowl, the Utah teapot that early 3D graphics drew again and again, and the Stanford bunny, a 3D scan used to test graphics for thirty years. Each photo's author and license are in the set's record.

### Take a photo
`look.camera`

Opens your camera in this page. Nothing is recorded or saved until you press "keep this one", and then only that one frame goes into the set.

### Click to select a blob
`look.click`

For select a blob: click on the object you want, and it outlines that blob. Click more places on it to add to the selection. Shift-click a place that is not part of it.

### Cut something out
`look.cutout`

Separates the main object in the photo, the blob that stands out most, from its background. You get a PNG with a transparent background: ready for a portfolio, a layout or a projection.

### Distance between blobs
`look.depth`

A depth map: guesses how near or far each blob and each part of the photo is. Near is light, far is dark. It is a guess from one picture, not a measurement, but it is often good enough for relief, displacement or projection mapping.

### Select a blob
`look.select`

Outlines the blob you clicked on and cuts it out. Use it when the photo has more than one object in it, or cut something out picked the wrong one.

### Every photo in the set
`look.all`

Runs the same tool on every photo in the set, one after another. Each one is its own command in the terminal.
