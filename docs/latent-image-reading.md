# The latent image: reading list

The texts for the latent image card, gathered 2026-11-11. The student's collection is screenshots of a person's photo roll or of their Instagram saved posts, stories and reels. He reads the latent image through media theory: what happens to a photograph when it is copied, screenshotted, averaged and generated again.

The dream and psychology sources that were here (Freud, Jung and his critics, dream science, the Korean and West African sources) belong to a different student's dream project. They are kept, unchanged, in `docs/dream-sources-from-latent.md`.

**How the texts enter the card.** The texts don't change the model: the encoder is given pictures only. They frame the latent image. The student reads them, chooses passages, and prints them beside the latent image on the gallery page, each with its source.

**What the access column means:**

- **Public domain:** free to download, quote and bring into the tool (`data raw gutenberg <number> <name>`).
- **Open (licence):** free to read online under the licence named. Quote with credit.
- **Free to read:** online at the publisher's site with no open licence. Read it there and quote short passages with credit; don't copy it into the tool.
- **Library:** a book or article in copyright. A student reads it through the university library and quotes it as research (short passages, with citation). It isn't copied into the tool or the repository. Copies of these circulate online without permission; don't link or download them.
- **Wikipedia (CC BY-SA 4.0):** an article about the work, always fair to bring in with `data raw wikipedia`. It is a summary, not the work.

Links and licences were checked on 2026-11-11.

## 1. The core texts

Each is tied to one part of the method. The line printed on the gallery page for each part is in `PSY` in `python/variable_machine/latent.py` (section 3 below).

| Text | What it says | Part of the method | Access |
|---|---|---|---|
| Walter Benjamin, "The Work of Art in the Age of Mechanical Reproduction" (1935; revised 1936–39). English: Harry Zohn, in *Illuminations* (1968); a newer translation is "The Work of Art in the Age of Its Technological Reproducibility", in *The Work of Art in the Age of Its Technological Reproducibility, and Other Writings on Media* (Harvard, 2008) | The **aura** is a work's here and now, its presence in one place. Mechanical reproduction takes the copy out of that place and out of tradition; from a negative any number of prints can be made, and asking for the authentic one makes no sense | The pixel average: reproduction taken one step further. A screenshot is a copy of a copy; the average is a copy of all the copies at once | English translations: **Library**. The German text (third version) is public domain where the term is life + 70 (Benjamin died 1940) and is on German Wikisource (de.wikisource.org, "Das Kunstwerk im Zeitalter seiner technischen Reproduzierbarkeit (Dritte Fassung)"). Wikipedia: "The Work of Art in the Age of Mechanical Reproduction" |
| Roland Barthes, *Camera Lucida: Reflections on Photography* (1980; translated by Richard Howard, 1981) | The **studium** is the general interest a photograph raises, coded by the viewer's culture. The **punctum** is the detail that pricks one viewer, by accident. The **that-has-been** (*ça-a-été*): a photograph certifies that its subject was there, in front of the lens | The latent image as studium, what the whole set shares; what a picture brings as a place to look for a punctum; the latent image as a picture with no that-has-been | **Library**. Wikipedia: "Camera Lucida (book)" and "Studium" |
| Jean Baudrillard, *Simulacra and Simulation* (1981; translated by Sheila Faria Glaser, 1994), "The Precession of Simulacra" | A **simulacrum** is a copy without an original. The image passes through four phases: it reflects a reality; it masks and distorts a reality; it masks the absence of a reality; it has no relation to any reality and is its own pure simulacrum. The **hyperreal** is a model of a real without origin. The three *orders* of simulacra (counterfeit, production, simulation) are set out earlier, in *Symbolic Exchange and Death* (1976) | The four phases run through the method: the photograph, the screenshot, the pixel average, the latent image | **Library**. Wikipedia: "Simulacra and Simulation", "Simulacrum", "Hyperreality" |
| Jacques Lacan, "The Mirror Stage as Formative of the Function of the I as Revealed in Psychoanalytic Experience" (1949), in *Écrits* (1966; translated by Alan Sheridan, 1977, and Bruce Fink, 2006) | Between about 6 and 18 months a child recognises itself in a mirror. The image is whole while the child's experience of its body is in pieces, so the self is formed on an image of unity it doesn't have: the **ideal-I**. The recognition is a misrecognition (*méconnaissance*) | The saved feed as a mirror the person recognises themselves in; the latent image as the unified self that no single picture shows | **Library**. Wikipedia: "Mirror stage" |
| Taina Bucher, *If...Then: Algorithmic Power and Politics* (Oxford University Press, 2018) | Feed algorithms decide what becomes visible, and people come to act toward them: what is seen, saved and posted is shaped by what the feed rewards | Saved posts: the set is the person's choices from what the recommender offered | **Library** |

## 2. Further texts, each tied to one part

| Text | What it says | Part of the method | Access |
|---|---|---|---|
| Hito Steyerl, "In Defense of the Poor Image", *e-flux journal* 10 (2009) | The **poor image** is a copy in motion: compressed, cropped, ripped, passed on. It loses resolution and gains speed and reach | The screenshots and the crop: a screenshot is a poor image, and the crop cuts a poor image out of the app's frame | **Free to read** at e-flux.com/journal/10/61362/in-defense-of-the-poor-image (no open licence: quote, don't copy) |
| Vilém Flusser, *Towards a Philosophy of Photography* (1983; translated by Anthony Mathews, Reaktion, 2000) | A camera is an **apparatus** with a **program**: the photographer plays inside the possibilities the program allows, and the photographs are its outputs. A **technical image** is made by an apparatus from concepts, not from the world directly | The model's terms: the latent image can only be a picture the model's program can draw | **Library** |
| Oliver Wendell Holmes, "The Stereoscope and the Stereograph", *The Atlantic Monthly* 3, no. 20 (June 1859) | "Form is henceforth divorced from matter": once a thing is photographed, its image can be kept, copied and traded without the thing | The encoder and its axes: the 1280 numbers keep a picture's form and drop the picture | **Public domain**: Gutenberg **11751** (the whole June 1859 issue; Holmes's essay is one article in it) |
| Plato, *Sophist* (translated by Benjamin Jowett) | Image-making is split into likeness-making, which keeps the original's proportions, and the "phantastic", which makes appearances that only seem like the original. Baudrillard's simulacrum goes back to this split | The latent image as a phantasm: it looks like a picture of something, and copies no thing | **Public domain**: Gutenberg **1735** |
| Susan Sontag, *On Photography* (1977) | Photographing turns experience into a collection of images; to collect photographs is to collect the world | The photo roll as a collection | **Library**. Wikipedia: "On Photography" |
| Joanna Zylinska, *AI Art: Machine Visions and Warped Dreams* (Open Humanities Press, 2020) | A critique of AI image-making and of the claims made for it | The latent image as a generated picture | **Open: CC BY-SA 4.0** |

## 3. What each part of the gallery page is like

Each part of the gallery page is printed with one line (`PSY` in `latent.py`). Each is a likeness: the statistics don't do what the theory describes. They give the student a place to argue from.

| Part of the page | Theory | The line, in short |
|---|---|---|
| The pixel average | Benjamin | Reproduction one step further: a copy of every copy at once, with no here and now left |
| The latent image | Barthes | The studium of the set, and a photograph with no that-has-been |
| The trained decoder | Baudrillard | The set's look, copied from no picture: the fourth phase |
| The model's terms | Flusser | A picture the model's program can draw |
| The whole page | Baudrillard | The four phases, from photograph to latent image |
| The whole page | Lacan | The feed as a mirror; the latent image as the ideal-I |
| The axes | Holmes | Form divorced from matter |
| What a picture brings | Barthes | Where to look for a punctum, which the numbers can't find |
| Saved posts (screenshot sets) | Bucher | The person's choices from what the recommender offered |
| Screenshots (screenshot sets) | Steyerl | Poor images, cut from the app's frame |

## 4. What to bring into the tool

The public-domain texts and the Wikipedia articles, with the command that fetches each:

```
data raw gutenberg 11751 holmes-stereograph
data raw gutenberg 1735 plato-sophist
data raw wikipedia The_Work_of_Art_in_the_Age_of_Mechanical_Reproduction benjamin-work-of-art
data raw wikipedia Camera_Lucida_(book) barthes-camera-lucida
data raw wikipedia Simulacra_and_Simulation baudrillard-simulacra
data raw wikipedia Mirror_stage lacan-mirror-stage
```

Gutenberg 11751 is the whole June 1859 *Atlantic*; Holmes's essay starts at "THE STEREOSCOPE AND THE STEREOGRAPH". The Wikipedia articles are summaries of works still in copyright: the works themselves are read through the library and quoted with citation. Steyerl's essay is read at e-flux. None of the library texts is copied into the repository.
