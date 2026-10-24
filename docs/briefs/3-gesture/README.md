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

With no camera, we used the Move tab's *a photo* route, on 13 photos of two gestures from Wikimedia Commons (raised fists and thumbs-up, all different people). A hand was found in **11 of 13**: missed in a crowd photo and in a tight close-up of a fist. The body tracker found 33 points on a standing person, the hand tracker 21 on an open palm, both drawn over the photo.

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

## What this says about the real instructions

The points are measured from the wrist and scaled by the hand's size, but **not turned**: a fist seen from the front and from the side are different shapes to it, as are a left and a right hand. That is on purpose (it can tell thumbs-up from thumbs-down), and it is why photos of ten different people's hands at ten angles made a poor training set. Your own hand, in front of your own camera, varies far less.

1. **Models:** `model get hands` (or `body`).
2. **Move:** make a gesture set, *the camera*.
3. Name a gesture and **hold to record while you make it, moving a little**: 3–5 seconds is 30–50 examples. Use the hand, the distance and the angle you'll use in the piece. Do every gesture, and add a "nothing" gesture (hand resting, or out of the way) so it has something to say when you're not gesturing.
4. **Train.** Read the grid: a number off the diagonal means two gestures look alike to it. Record more of those two, or make them more different.
5. **Test it live.** Watch the confidence: if it flickers, record more.
6. **Send:** set the port your other software listens on (TouchDesigner: OSC In; Max: `udpreceive 9000`; Pure Data: `netreceive -u -b 9000`), press *send*, and keep the Move tab open while you play. The message is `/vm/<set> <gesture> <confidence>`.
7. **Someone else plays it:** it learned your hand. If it fails on theirs, record theirs too (with their agreement) into the same set and train again.

## What Variable Machine needs, found by doing this

- **The camera route, tried with a real camera** (blocked where this was tested).
- **A clear message** when *add this photo* or *hold to record* finds no hand, instead of a silent disabled button.
- **More than one hand**: the tracker follows one hand; two-handed gestures need both.
- **Numbers, not only names**: a slider-style output (how open the hand is, 0–1), for sound and light that change smoothly. The brief asked for it; only names are sent.
- **MIDI and serial (Arduino)** out, besides OSC.
- **A video file as a source**, so a gesture set can be built and checked without a live camera (and in class, from a shared recording).
