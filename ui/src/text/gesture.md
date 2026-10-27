# The gesture tab

Every word on the gesture tab, from the top of the page to the bottom: the left column (steps, sets, models), then the right one (the camera, recording, training, testing, using it in your patch). Edit the words here: `npm run dev` rebuilds the page when you save, and you see the change when you reload it. `npm run build` does the same once.

Each entry is:

- a `###` line with its **title**, to find it by. On a flag (a pop-up that explains a control), the title is shown: it is the bold words at the top of the flag;
- on the next line, its **name** in backticks, which ties it to its place on the page. Don't change the name. A flag says so after its name: `move.camera` flag;
- then its **text**, one paragraph (line breaks inside it become spaces).

In the text:

- a word in braces, like `{n}`, is filled in by the page: a number, a name, a command. Keep the braces and the word inside them as they are; move them around the sentence as you like;
- `code`, *italic* and **bold** are shown as such (backticks, one star, two stars);
- commands, model names, file paths and numbers the page works out are not here: they come from the code.

The build checks this file against the page, and stops with a message naming the entry if a name is missing, unused or misspelt, or a placeholder doesn't match. The `##` sections are only for finding your way; they are not shown.

## The tab's name, in the top bar

### Gesture
`panel.gesture` flag

Gesture recognition. A tracker finds points on your hands (21 on each, up to two) or your body (33) in the camera picture, and a model you train yourself names the gesture they make. Record a few examples of two or more gestures, train (it takes a moment), test it live, and send what it sees as OSC to TouchDesigner, Max, Pure Data or anything else that listens. Everything runs in this page; only the points are kept, never the camera picture.

### The tab, for a screen reader
`gesture.label`

move

## Steps

### Heading
`gesture.steps.title`

steps · from your {what} to a gesture in your patch

### What you follow: your hands
`gesture.what.hands`

hands

### What you follow: your body
`gesture.what.body`

body

### Steps
`move.steps` flag

The way from nothing to a gesture your patch can hear, in order. Each step says whether it is done, the one to do now, or waiting, and the step to do now says how. They tick themselves off as you go.

### The steps, for a screen reader
`gesture.steps.label`

steps

### A step that is done
`gesture.steps.done`

done

### The step to do now
`gesture.steps.now`

now

### A step still waiting
`gesture.steps.waiting`

waiting

### Step 1
`gesture.step.tracker`

get the tracker

### Step 1: how
`gesture.step.tracker.how`

download the {tracker} tracker ({mb} MB): it finds the points on your {what} in the picture

### Step 2
`gesture.step.set`

choose a set

### Step 2: how
`gesture.step.set.how`

start with the example set, or make your own: give it a name, choose one hand, two hands or a body, and press make the set

### Step 3
`gesture.step.camera`

start the camera

### Step 3: how
`gesture.step.camera.how`

press start the camera, and allow it when the browser asks (or use a photo)

### Step 4
`gesture.step.record`

record two or more gestures

### Step 4: how
`gesture.step.record.how`

name a gesture, tap to record, make it for 3–5 seconds once the count is done, and tap to stop (at least 5 examples of each); then another

### Step 5
`gesture.step.train`

train

### Step 5: how
`gesture.step.train.how`

press train: it takes a second, and shows which gestures it mixes up

### Step 6
`gesture.step.test`

test it, and send it on

### Step 6: how
`gesture.step.test.how`

test it live, then send it on as OSC; "use it in your patch" on the right says what to put in TouchDesigner, Max or Pure Data

## Gesture sets

### Heading
`gesture.sets.title`

gesture sets · start with the example, then make your own

### Gesture set
`move.set` flag

A set is a few gestures, the examples recorded of each, and the model trained on them, in workspace/gestures. Start with the example: three hand gestures recorded for you, ready to train, so you can see it work (and fail) with your own hand. Then make your own. A set follows hands or a body. A hands set takes one hand or two, so it can hold one-handed gestures and two-handed ones. One hand reads the same whichever hand it is; with two, it keeps which is which and where they are from each other.

### The sets, for a screen reader
`gesture.sets.label`

gesture sets

### The example, not copied in yet
`gesture.sets.example`

the example · {gestures} · {n} examples

### The example, copying
`gesture.sets.example.copying`

copying it in…

### The example: copy it in
`gesture.sets.example.copy`

start here: copy it in

### A set
`gesture.sets.set`

{tracker} · {gestures} gestures · {n} examples

### The example, once copied in
`gesture.sets.set.example`

the example · {tracker} · {gestures} gestures · {n} examples

### Trained
`gesture.sets.set.trained`

trained

### Not trained
`gesture.sets.set.untrained`

not trained yet

### Following hands
`gesture.tracker.hands`

hands, one or two

### Following a body
`gesture.tracker.body`

a body

### Make your own
`gesture.sets.new`

+ make your own

### Make your own: under it
`gesture.sets.new.about`

your gestures, your hand, your camera

## Making your own set

### Name
`gesture.new.name`

name

### Name: example
`gesture.new.name.placeholder`

studio-hands

### Its tracker
`gesture.new.tracker`

its tracker

### Its tracker: hands
`gesture.new.tracker.hands`

either hand or both: one set can hold one-handed gestures and two-handed ones.

### Its tracker: what it does
`gesture.new.tracker.about`

this picks what the set follows; it doesn't download anything

### The tracker: download
`gesture.tracker.download`

download the {tracker} tracker ({mb} MB)

### The tracker: download, beside the command
`gesture.tracker.download.label`

download the {tracker} tracker

### The tracker: downloading
`gesture.tracker.downloading`

downloading the {tracker} tracker

### Download the tracker
`move.get` flag

Downloads the tracker, one small file from Google's MediaPipe, into workspace/tools. It runs in this page. You don't train it: it finds the points, and your own model names the gesture.

### Make a set
`move.new` flag

Starts a new gesture set for hands (one or two) or for a body. Then name a gesture and record some examples of it.

### Make the set
`gesture.new.make`

make the set

### Making the set
`gesture.new.making`

making the set…

### No name yet
`gesture.new.nameFirst`

name it first

### The name is taken
`gesture.new.taken`

there is already a set called {name}: choose it above, or give this one another name

## Choose a model

### Heading
`gesture.models.title`

choose a model

### What the trackers are
`gesture.models.intro`

The model that finds the points: on a hand (21) or on a whole body (33). It is ready-made and you don't train it: it runs in this page and turns each camera frame into points. Your gestures then train the small model that names them. A set uses one or the other: the hands tracker finds one hand or two.

### A tracker's card: its file
`gesture.tracker.card.file`

{file} · about {mb} MB · {where}

### A tracker's card: downloaded
`gesture.tracker.card.here`

in {folder}

### A tracker's card: not downloaded
`gesture.tracker.card.notHere`

not downloaded yet

### A tracker's card: download, beside the command
`gesture.tracker.card.download`

download {tracker}

## The camera, examples and training (the right column)

### For a screen reader
`gesture.studio.label`

camera, examples and training

### No set yet
`gesture.studio.empty`

your camera, your gestures and training appear here once there is a set: make one on the left

### Recording, in the lightbox
`gesture.focus.record`

record examples · {set}

### Testing, in the lightbox
`gesture.focus.test`

test it, and send it on · {set}

### Close the recording lightbox
`gesture.focus.done`

done (esc)

### Close the testing lightbox
`gesture.focus.stopTesting`

stop testing (esc)

### Source, for a screen reader
`gesture.source.label`

source

### Source: the camera
`gesture.source.camera`

the camera

### Source: a photo
`gesture.source.photo`

a photo

### Waiting for the camera
`gesture.camera.waiting`

waiting for the camera: allow it if the browser asks

### Start the camera
`move.camera` flag

Opens your camera in this page. The browser asks you once, when you press it; nothing is recorded or saved but the points the tracker finds, and the camera turns off when you leave this tab. If it is blocked, the message under this button says where to allow it.

### Start the camera
`gesture.camera.start`

start the camera

### Blocked
`gesture.camera.denied`

The camera is blocked, so the browser didn't ask. To allow it:

### Blocked: Chrome
`gesture.camera.denied.chrome`

Chrome: click the icon at the left of the address bar (a camera, or two sliders), set Camera to Allow, then reload this page.

### Blocked: Safari
`gesture.camera.denied.safari`

Safari: Safari › Settings for this website (or Settings › Websites › Camera), set Camera to Allow, then reload.

### Blocked: the Mac
`gesture.camera.denied.mac`

Still blocked? The Mac is blocking the browser: System Settings › Privacy & Security › Camera, turn your browser on, then quit the browser and open it again.

### Blocked: a photo instead
`gesture.camera.denied.photo`

Or use a photo instead.

### No camera
`gesture.camera.none`

No camera was found. Connect one and press start the camera again, or use a photo instead.

### Camera in use
`gesture.camera.busy`

Another app is using the camera (FaceTime, Zoom, Photo Booth…). Close it, then press start the camera again.

### No camera in this browser
`gesture.camera.unavailable`

This browser can't open a camera from this page. Open Variable Machine at {address} in Chrome or Safari.

### The camera didn't start
`gesture.camera.error`

The camera didn't start: {message}. Press start the camera again, or use a photo instead.

### Loading the tracker
`gesture.tracker.loading`

loading the {tracker} tracker

### Recording, on the picture
`gesture.view.recording`

recording {gesture} · tap to stop

### Found: a body
`gesture.found.body`

a body: 33 points

### Found: no body
`gesture.found.noBody`

no body found yet

### Found: no hands
`gesture.found.noHands`

no hands found yet

### Found: two hands
`gesture.found.twoHands`

two hands: 42 points

### Found: a hand
`gesture.found.oneHand`

a hand: 21 points

### Under the picture
`gesture.view.onlyPoints`

only the points are kept, never the picture

### Stop the camera
`gesture.camera.stop`

stop the camera

## 1 · Record examples

### Heading
`gesture.record.title`

1 · record examples

### Open the recorder
`gesture.record.open`

open the recorder

### A gesture's examples
`gesture.record.count`

{n} examples

### Tap to record
`move.record` flag

Your hands are busy making the gesture, or you are standing back from the computer, so one tap starts recording and the next tap stops it (the space bar works the same way). After the tap you have 3 seconds to get your hands into place (5 to step back, for a body); only then is the shape recorded, ten times a second: the points, measured from each wrist (or the hips), so the same gesture reads the same anywhere in the picture. Move a little while it records, so the examples vary: 20 to 50 of each gesture is plenty.

### Tap to record
`gesture.record.tap`

tap to record

### Getting ready
`gesture.record.getReady`

get ready: {n}…

### Recording
`gesture.record.recording`

recording… tap to stop

### Add this photo
`gesture.record.addPhoto`

add this photo

### Forget a gesture's examples
`gesture.record.forget`

forget

### A new gesture: the first
`gesture.record.first`

name a gesture: open, fist, wave…

### A new gesture: another
`gesture.record.another`

another gesture

### Space bar: getting ready
`gesture.record.hint.getReady`

get ready: {n}… then make {gesture}

### Space bar: recording
`gesture.record.hint.recording`

recording {gesture}… tap again (or the space bar) to stop

### Space bar
`gesture.record.hint.space`

or press the space bar to start recording {gesture}, and again to stop

### Space bar: still in the name
`gesture.record.hint.returnFirst`

(press Return first if you are still in the name)

### Nothing found: hands
`gesture.record.nothing.hands`

nothing was found to record: get your whole hand or hands in the picture

### Nothing found: a body
`gesture.record.nothing.body`

nothing was found to record: get your whole body in the picture

### Recording failed
`gesture.record.failed`

recording failed

## 2 · Train

### Heading
`gesture.train.title`

2 · train

### Train
`move.train` flag

k-nearest neighbours: a new pose is compared with every example you recorded, and the 5 closest vote. Training keeps your examples, after checking it on every fifth one set aside. The grid shows the check: each gesture you made, down the side, and what it was named, across. Mistakes off the diagonal show which gestures look alike to it.

### Train, beside the command
`gesture.train.label`

train

### What training found
`gesture.train.result`

{examples} examples, k = {k} · {correct} of {heldOut} set aside named right

### The grid's corner
`gesture.train.grid`

made \ named

## 3 · Test it, and send it on

### Heading
`gesture.test.title`

3 · test it, and send it on

### Test it live
`move.test` flag

Opens the camera with the test in a lightbox. Names your gesture as you make it, and shows how many of the nearest examples agree. A pose farther than any of your examples, or no hand in the picture, is named none. Try the gestures it mixes up, and record more examples of them.

### Test it live
`gesture.test.start`

test it live

### Stop testing
`gesture.test.stop`

stop testing

### None of your gestures
`gesture.test.none`

none of your gestures: farther than any example

### Nothing in the picture
`gesture.test.nothing`

no {what} in the picture

### How sure
`gesture.test.agree`

{percent}% of the {k} nearest agree

### OSC port
`gesture.test.port`

OSC port

### Send it on
`move.send` flag

While you test, every guess goes out as an OSC message to this computer on that port: the address /vm/<set>, then the gesture's name and how sure it is (0 to 1), or none and 0 when it is none of them. In TouchDesigner use an OSC In CHAT/DAT, in Max udpreceive, in Pure Data netreceive -u -b. Nothing goes to any other computer.

### Send, beside the command
`gesture.test.send`

send

### Stop sending
`gesture.test.stopSending`

stop sending

## 4 · Use it in your patch

### Use it in your patch
`move.use` flag

Where a gesture goes once you send it: an OSC message to this computer, on the port you chose, for as long as this tab tests it live. TouchDesigner, Max and Pure Data each pick it up with one or two objects, listed here. The set itself travels as a zip from Share.

### Heading
`gesture.use.title`

4 · use it in your patch

### What is sent
`gesture.use.how`

With *test it live* and *send* on{sending}, every guess goes to this computer, port {port}, as an OSC message: the address, the gesture's name, and how many of the nearest examples agree (0 to 1). When it is none of your gestures, or there is no hand in the picture, the name is *none* and the number 0.

### Sending now
`gesture.use.sendingNow`

(sending now)

### Keep the tab open
`gesture.use.keepOpen`

Keep this tab open while you play: Variable Machine does the seeing, your patch does the rest.

### TouchDesigner
`gesture.use.td`

TouchDesigner

### TouchDesigner: how
`gesture.use.td.how`

an **OSC In DAT**, Network Port {port}. Each guess arrives as a row: the address, then the gesture and the confidence. Act on it with a DAT Execute, or pick the gesture out with a Select DAT.

### Max
`gesture.use.max`

Max

### Max: how
`gesture.use.max.how`

{objects}: the gesture out of the left, the confidence out of the right.

### Pure Data
`gesture.use.pd`

Pure Data

### Pure Data: how
`gesture.use.pd.how`

{objects}: the gesture and the confidence.

### Check it arrives
`gesture.use.check`

Check it arrives

### Check it arrives: how
`gesture.use.check.how`

in a Terminal, in the variable-machine folder: `{command}` prints each message.

### Take the set with you
`gesture.use.take`

Take the set with you

### Take the set with you: how
`gesture.use.take.how`

Share → `{command}`: the examples and the trained model, to unzip into anyone's Variable Machine.
