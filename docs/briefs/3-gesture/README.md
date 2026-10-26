# Brief 3: gesture recognition and camera projects — what happened when we tried it

Tried on 2026-10-24 with Variable Machine v0.2, in a browser that **blocks the camera** (the Claude app's browser pane), so the camera route itself is untested; everything else was done for real. The camera route uses the same code as the photo route below, only fed ten frames a second instead of one photo.

**The idea in one line:** the tracker finds 21 points on your hand; you record examples of a few gestures; a k-nearest-neighbours model names them; the name goes to TouchDesigner, Max or Pure Data as OSC.

## What we did, step by step

### 1. Download the tracker · seconds

```
model get hands        hand_landmarker.task, 8 MB, Apache 2.0 (MediaPipe)
model get body         pose_landmarker_lite.task, 6 MB
```

### 2. Check that it finds hands · 3 seconds a photo

With no camera, we used the gesture tab's *a photo* route, on 13 photos of two gestures from Wikimedia Commons (raised fists and thumbs-up, all different people). A hand was found in **11 of 13**: missed in a crowd photo and in a tight close-up of a fist. The body tracker found 33 points on a standing person, the hand tracker 21 on an open palm, both drawn over the photo.

### 3. Make a gesture set and record examples

```
gesture new fist-or-thumb --tracker hands
```

Then on the tab: name a gesture, pick a photo, *add this photo*. Each photo is one example (the camera's *hold to record* takes ten a second), so after the misses there were exactly **5 fists and 5 thumbs-up**, the least `gesture train` accepts.

Two problems found here, both fixed (commit 0b5b811):
- Right after picking a new photo, the page still showed the last photo's points ("a hand: 21 points") while it tracked the new one. Pressing *add this photo* in that moment saved the **previous** photo's points under the new gesture. Picking a photo now clears the old points at once.
- Clicking *add this photo* when no hand was found does nothing, silently (the button is disabled; the caption says "no hand found yet"). Worth a clearer message.

### 4. Train · instant

```
gesture train fist-or-thumb
  k-nearest neighbours, k = 5: 10 examples, every fifth set aside to check
  made \ named       fist  thumbs up
  fist                 0          1
  thumbs up            1          0
  0 of 2 set-aside examples named right (0%)
```

With 5 examples each, the check keeps 4 of each and asks the 5 nearest of 8 to vote, so no gesture can win by much. `gesture train` now chooses k from the smallest gesture when `--k` isn't given (k = 3 here). The check stayed 0 of 2: one set-aside photo per gesture, of a stranger's hand at a new angle, is too little to measure anything.

### 5. Test it live, and send it on · works

```
gesture send fist-or-thumb --port 9125
```

With *test it live* on, each photo picked was named, and every guess arrived at a UDP listener on port 9125 (standing in for TouchDesigner) as an OSC message:

| photo | in training? | named | OSC received |
|---|---|---|---|
| thumbs-6 | no | thumbs up, 3 of 3 nearest agree | `/vm/fist-or-thumb ,sf "thumbs up" 1.0` |
| fist-8 | yes | fist, 2 of 3 | `/vm/fist-or-thumb ,sf "fist" 0.667` |
| thumbs-2 | yes | thumbs up, 3 of 3 | `/vm/fist-or-thumb ,sf "thumbs up" 1.0` |

(Earlier, 40 consistent examples of two gestures gave 8 of 8 on the check, and a guess reached the listener the same way.)

## Reproduce it

`VM ›` lines go in Variable Machine's terminal; `$` lines in a Terminal window in the `variable-machine` folder; **page:** lines are clicks on the gesture tab. Use Chrome (the camera needs it; Safari works too). About 10 minutes.

### Without a camera: the photo route (what was tested, twice)

```
$ python3 docs/briefs/3-gesture/fetch-photos.py
VM › model get hands
VM › gesture new fist-or-thumb --tracker hands
```

Expect: 14 photos in `workspace/images/gesture-test/` (8 fists, 6 thumbs-up; three more titles in the first list have gone from Commons).

Then on the gesture tab (the set `fist-or-thumb · hands` is already chosen):

1. **page:** *a photo* → *add a picture* → choose the set `gesture-test`.
2. **page:** type `fist` in *name a gesture*. Click a fist photo, **wait until the caption under it says "a hand: 21 points"**, then *add this photo*. Click the small photo above the picture to choose the next one. Do fist-2, 3, 4, 5 and 8: fist-1 (a crowd), fist-6 and fist-7 (a tight close-up) say "no hand found yet", and *add this photo* stays grey.
3. **page:** type `thumbs up` in *another gesture*, and add thumbs-1 to thumbs-5 the same way, with the *add this photo* on the thumbs up line. Keep thumbs-6 back for the test.
4. Train, and start a listener that stands in for TouchDesigner:

```
VM › gesture train fist-or-thumb
$ node docs/briefs/3-gesture/osc-listen.mjs 9125
VM › gesture send fist-or-thumb --port 9125
```

5. **page:** *test it live*, then choose thumbs-6.

Expect: 10 examples, **k = 3**, the grid with a 1 off the diagonal in each row and **0 of 2** set-aside examples named right (one photo per gesture can't measure much); thumbs-6 named **thumbs up, 100% of the 3 nearest agree**, and the listener prints `/vm/fist-or-thumb "thumbs up" 1.000`. A training photo can still come out wrong (thumbs-5 was named "fist", 67%): strangers' hands at different angles are a poor training set, and that's the lesson. Stop with `gesture send fist-or-thumb --stop` and ctrl-C in the listener.

Two things that will trip you up:
- The *osc port* box on the page still says 9000 when you started sending from the terminal with `--port 9125`: the terminal's port is the one in use. Use one or the other.
- The photo picker forgets the set when the page reloads; choose `gesture-test` again.

### With a camera: the route for Tuesday (**not yet tried with a real camera**)

```
VM › model get hands
VM › gesture new my-hands --tracker hands
$ node docs/briefs/3-gesture/osc-listen.mjs 9000
```

1. **page:** *the camera*. Chrome asks to use the camera: allow it. Your picture appears with 21 points drawn on your hand.
2. **page:** name a gesture `open`, hold your open hand where you'll use it, and **hold *hold to record*** for 3–5 seconds while moving it a little (30–50 examples).
3. **page:** *another gesture*: `fist`, the same way. Then `nothing`: your hand relaxed and resting, still in the picture (with no hand in the picture there are no points to record).
4. **page:** *train* (or `VM › gesture train my-hands`). Expect nearly everything on the diagonal: your own hand varies far less than strangers' photos.
5. **page:** *test it live*, set *osc port* to 9000, *send*. Open and close your hand: the listener prints `/vm/my-hands "open" 1.000`, `/vm/my-hands "fist" …`. In TouchDesigner, an OSC In CHOP or DAT on port 9000 shows the same.

The camera runs only while the gesture tab is showing; switch tabs and it stops.

## What this says about the real instructions

The points are measured from the wrist and scaled by the hand's size, but **not turned**: a fist seen from the front and from the side are different shapes to it, as are a left and a right hand. That is on purpose (it can tell thumbs-up from thumbs-down), and it is why photos of ten different people's hands at ten angles made a poor training set. Your own hand, in front of your own camera, varies far less.

1. **Models:** `model get hands` (or `body`).
2. **The gesture tab:** make a gesture set, *the camera*.
3. Name a gesture and **hold to record while you make it, moving a little**: 3–5 seconds is 30–50 examples. Use the hand, the distance and the angle you'll use in the piece. Do every gesture, and add a "nothing" gesture (your hand relaxed, still in the picture: with no hand there are no points to record) so it has something to say when you're not gesturing.
4. **Train.** Read the grid: a number off the diagonal means two gestures look alike to it. Record more of those two, or make them more different.
5. **Test it live.** Watch the confidence: if it flickers, record more.
6. **Send:** set the port your other software listens on (TouchDesigner: OSC In; Max: `udpreceive 9000`; Pure Data: `netreceive -u -b 9000`), press *send*, and keep the gesture tab open while you play. The message is `/vm/<set> <gesture> <confidence>`.
7. **Someone else plays it:** it learned your hand. If it fails on theirs, record theirs too (with their agreement) into the same set and train again.

## What Variable Machine needs, found by doing this

- **The camera route, tried with a real camera** (blocked where this was tested).
- **The photo strip** grew past the window's edge with more than about ten photos, so the last ones couldn't be reached; fixed (it scrolls).
- **One port:** the page's *osc port* box doesn't show a port set from the terminal.
- **A clear message** when *add this photo* or *hold to record* finds no hand, instead of a silent disabled button.
- **A face model**, for later: a third choice beside hands and body (MediaPipe's face landmarker, 478 points), for expressions as gestures.
- **More than one hand**: the tracker follows one hand; two-handed gestures need both.
- **Numbers, not only names**: a slider-style output (how open the hand is, 0–1), for sound and light that change smoothly. The brief asked for it; only names are sent.
- **MIDI and serial (Arduino)** out, besides OSC.
- **A video file as a source**, so a gesture set can be built and checked without a live camera (and in class, from a shared recording).
