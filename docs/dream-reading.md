# Dream reading: reading list

The texts for the dream reading card ([`dream-card-plan.md`](dream-card-plan.md)), gathered 2026-11-11. The dream sources first gathered for the latent image card ([`latent-image-reading.md`](latent-image-reading.md), sections 1–3 and 6) belong to this project and are carried over here, checked again, with Taiwanese and Chinese sources added first.

**How the texts enter the card:**

- **The *Zhougong jiemeng*** is the dream book the card reads from: every reading is made from its lines.
- **The rest are framing.** One line from each of several is printed under every reading (`FRAMES` in `python/variable_machine/dream.py`). The student reads them, chooses, and edits those lines.
- No text trains a model.

**What the access column means:**

- **Public domain:** free to download, quote and bring into the tool (`data raw txt`, `data raw gutenberg`).
- **Open (licence):** free to read online under the licence named. Quote with credit; check NC (no commercial use) and ND (no changed versions) before reusing.
- **Library:** an academic book or article. Read it through the university library and quote it as research (short passages, with citation). It isn't copied into the tool or the repository.
- **Read online:** free to read on the web, with no open licence: quote, don't copy.

Links were checked on 2026-11-11. "Not confirmed" means a detail couldn't be checked from the source itself.

## 1. Chinese dream interpretation

### Primary texts

| Text | What it is | Access |
|---|---|---|
| ***Zhougong jiemeng*** (周公解夢, "The Duke of Zhou's interpretation of dreams") | The folk dream dictionary, attributed to the Duke of Zhou (11th century BCE); the attribution is legend, and the book in this form is late imperial. 27 sections by subject (天地日月星辰 sky, earth, sun, moon and stars … 龜鱉魚蝦昆蟲 turtles, fish and insects) and 988 lines, each a dream and its omen: 蛇入門主得財, "a snake comes in at the gate: you will gain wealth" | **Public domain** (marked PD-old): Chinese Wikisource, zh.wikisource.org/wiki/周公解夢. No source edition is stated. Brought in by the card (`zhougong-jiemeng`) |
| **Dunhuang dream books**, e.g. Pelliot chinois 3908, 新集周公解夢書 (*Newly collected book of the Duke of Zhou's interpretation of dreams*), 10th century | The oldest surviving manuscripts of the dream-book tradition: a preface, 18 categories of dream, 3 on the conditions of dreaming and 1 on averting bad dreams. P.2829 and P.3105 are other dream books from the same cave | **Read online:** P.3908 is digitised on Gallica, gallica.bnf.fr/ark:/12148/btv1b8300230n (free for non-commercial use). No digitised copy of P.2829 or P.3105 was found |
| **Wang Fu** (王符), *Qianfu lun* (潛夫論, *Discourses of a recluse*), chapter 28, "Meng lie" (夢列, "The kinds of dream"), 2nd century | The first systematic account of dream interpretation: ten kinds of dream (凡夢，有直、有象、有精、有想、有人、有感、有時、有反、有病、有性): the direct, the symbolic, of concentration, of thought, of the person, of feeling, of the season, of the opposite, of illness and of temperament. The same image means different things in different kinds | **Public domain:** zh.wikisource.org/wiki/潛夫論/卷七 (chapter 28 is in *juan* 7). Brought in by the card (`wangfu-menglie`). Also on ctext.org/qian-fu-lun, to read only (below) |
| ***Liezi*** (列子), chapter 3, "King Mu of Zhou" (周穆王) | Six kinds of dream (正夢、蘁夢、思夢、寤夢、喜夢、懼夢); the man of Zheng who hides a deer and then thinks he dreamt it; Mr Yin's servant, who dreams every night that he is a lord | **Public domain:** Chinese at zh.wikisource.org/wiki/列子/周穆王篇 (`liezi-zh`); Lionel Giles's English (1912), *Taoist Teachings from the Book of Lieh Tzŭ*, Book III, "Dreams", on en.wikisource (`liezi-dreams`). Giles abridges: his translation has the deer and the servant, but not the list of six dreams |
| A. C. Graham, *The Book of Lieh-tzŭ* (1960; Columbia University Press, 1990) | The full English translation | Library |
| **Zhuangzi** (莊子), chapter 2: the butterfly dream | Zhuangzi dreams he is a butterfly, and wakes unsure which is the dreamer | **Public domain:** Herbert Giles's translation (1889), Gutenberg **59709** (`zhuangzi`) |
| **Chen Shiyuan** (陳士元), *Mengzhan yizhi* (夢占逸旨, *Lost meanings of dream divination*), 1562 | A Ming encyclopedia of dream interpretation: an inner part of 10 chapters on the theory of dreams, an outer part of 20 on dreams by subject, with cases from history | The Chinese text isn't on Wikisource (no page found); ctext.org not confirmed. In English, read Strassberg (below). An annotated Japanese translation by Shimizu Yōko is open on Osaka University's repository: ir.library.osaka-u.ac.jp/repo/ouka/all/60923/cks_051_001.pdf |

**On ctext.org.** The Chinese Text Project holds most of these texts, with good search. Its terms forbid automated downloading; it says it returns corrupted data to scrapers, and machine access needs its paid API. Read and quote there; bring texts into the tool from Wikisource.

### Scholarship

| Text | What it says | Access |
|---|---|---|
| Richard E. Strassberg, trans., *Wandering Spirits: Chen Shiyuan's Encyclopedia of Dreams* (University of California Press, 2008), ISBN 978-0-520-25294-3 (paperback 2022, 978-0-520-38969-4) | The translation of the *Mengzhan yizhi*, with an introduction to Chinese dream theory | Library (no open-access edition) |
| Roberto K. Ong, *The Interpretation of Dreams in Ancient China* (Bochum: Studienverlag Brockmeyer, 1985), Chinathemen 23, ISBN 978-3-88339-446-6 | The standard English study of early Chinese dream interpretation, from oracle bones to the Han | Library. It grew from Ong's UBC PhD thesis (1981), on UBC's Open Collections; its licence was not confirmed |
| Carolyn T. Brown, ed., *Psycho-Sinology: The Universe of Dreams in Chinese Culture* (Woodrow Wilson International Center for Scholars / University Press of America, 1988) | Essays on dreams in Chinese literature, religion and medicine | Library |
| Ze Hong, "Dream Interpretation from a Cognitive and Cultural Evolutionary Perspective: The Case of Oneiromancy in Traditional China", *Cognitive Science* 46, no. 1 (2022): e13088, doi:10.1111/cogs.13088 | Why dream divination persisted in China: a cognitive and cultural-evolution account, using dream books and recorded cases. The best fit for this project | Library (Wiley's standard licence, not open); a free author's copy is on the Harvard Cultural Evolution Lab's site |
| Jean-Pierre Drège, edition and study of P.3908, in Michel Soymié, ed., *Nouvelles contributions aux études de Touen-houang* (Geneva: Droz, 1981), pp. 205–249 | The Dunhuang dream book edited and studied (in French) | Library; the article's exact title not confirmed |
| Jean-Pierre Drège and Dimitri Drettas, on dream divination, in Marc Kalinowski, ed., *Divination et société dans la Chine médiévale* (Paris: BnF, 2003) | The Dunhuang dream books among the manuscripts of divination (in French) | Library; the chapter's title not confirmed |
| 劉文英 (Liu Wenying), 《夢的迷信與夢的探索》 (*Dream superstition and the exploration of dreams*) (Beijing: 中國社會科學出版社, 1989) | The main Chinese-language history of dream interpretation in China | Library |
| Barbara Aniela Bonar, "The Dreamer and Their Authenticity in the *Zhuangzi*", *Religions* 10, no. 2 (2019): 75, doi:10.3390/rel10020075 | The butterfly dream read with Lacan | **Open:** MDPI publishes under CC BY 4.0 (the licence on the page not confirmed) |

## 2. Taiwanese practice: temples, dream incubation and divination

In Taiwan, dreams are read less from a book than at a temple. **Dream incubation** (求夢 or 祈夢, "asking for a dream") is sleeping in a temple to receive a dream from its god; the dream is then confirmed, or read, with the temple's divination tools:

- **Moon blocks** (擲筊, *poe* or *bwa bwei*): two crescent-shaped blocks are dropped. One flat side up and one round side up (聖筊) is the god's yes.
- **Fortune sticks** (求籤, *kau chim*): a stick is shaken from a cup; its number gives a poem (籤詩), which a temple reader interprets.

| Text | What it says | Access |
|---|---|---|
| TaiwanPlus, "Matsu Islands Temple Offers Believers Divine Dreams", 30 March 2026 | A temple on Beigan, Matsu, holds a night of dream incubation once a year: believers fast, sleep on the temple floor, and toss moon blocks to confirm what they dreamt | **Read online** (news), taiwanplus.com |
| Xu Xiake (徐霞客), diary of a trip to Nine Carp Lake (九鯉湖), Fujian, 17th century; in James M. Hargett, trans., *Wading Barefoot through a Mountain Stream* (University of Washington Press) | Pilgrims pray for dreams at the shrine of the Nine Immortals (九仙). Nine Carp Lake was the best-known place of dream incubation in the region Taiwan's Hokkien settlers came from; news reports tie Matsu's practice to it, but no scholarly source for that link was found | Library, or read online on the press's Manifold site (all rights reserved) |
| Wikipedia, "Dream incubation" | The practice from ancient Egypt and Greece (Asclepius) to the present | **Open: CC BY-SA 4.0**; brought in by the card (`dream-incubation`) |
| Wikipedia, "Kau chim" | Fortune sticks: how they are drawn and read | **Open: CC BY-SA 4.0** (`data raw wikipedia Kau_chim kau-chim`) |
| Taiwan Tourism Administration, the culture pages on temple practice (taiwan.net.tw) | Moon blocks and fortune sticks, for visitors | Read online (the page was found by search; it wouldn't load for checking) |
| 《臺灣大百科全書》 (*Encyclopedia of Taiwan*), religion and folk custom entries, taiwanpedia.culture.tw | Entries on 擲筊, 求籤 and temple practice, in Chinese | Read online (the entries themselves not confirmed) |

**For the card:** the installation is closer to the temple than to the book. A visitor brings a dream, makes a choice (as the blocks are dropped), and is given a text to read (as the fortune poem is). The student may want to say so in the room, or have the visitor confirm a reading the way the blocks do.

## 3. Korea (carried over from the latent image reading list)

Korean writing has a long tradition of the dream as a whole life seen and woken from, and of dreams that can be given, bought or read before a birth.

| Text | What it says | Access |
|---|---|---|
| Kim Man-jung, *Kuunmong* (*The Cloud Dream of the Nine*, 1687), translated by James Scarth Gale (1922) | A monk dreams a whole worldly life and wakes to find it a dream | **Public domain:** Internet Archive `cu31924023333077` (read by OCR); `data raw txt` brings it in (`kuunmong`) |
| Iryeon, *Samguk yusa* (1280s): the monk Josin, who dreams fifty years of married life in one nap | The source of the "whole life in a dream" form; it shares it with the Chinese "Yellow Millet Dream" (黃粱夢), which the *Zhougong jiemeng*'s opening verse names (黃梁) | Library: Frits Vos et al., *Vestiges of the Three Kingdoms of Ancient Korea* (University of Hawai'i Press, 2025) |
| *Samguk yusa*: Munhui buys her elder sister's dream, and so becomes queen | A dream as something owned and traded (not checked in a translation) | Library, as above |
| **Taemong** (태몽), the conception dream | A dream that announces a child and its nature; dragons and snakes are common, as they are in the *Zhougong jiemeng*'s 蛇入懷中生貴子, "a snake enters your bosom: you will bear a noble child" | Library: Fred Jeremy Seligson, *Oriental Birth Dreams* (Hollym, 1989) |

## 4. West Africa (carried over)

In much West African thought, a dream isn't a private message from the dreamer's own unconscious. It is a social event: a visit from ancestors or spirits, a call to an office, knowledge given to a diviner.

| Text | What it says | Access |
|---|---|---|
| M. C. Jedrej and Rosalind Shaw, eds., *Dreaming, Religion and Society in Africa* (Brill, 1992) | The standard collection, with Shaw on Temne divination, McKenzie on Yoruba dreams and Ray on the Igbo call to office | Library |
| Genevieve Nrenzah, "Dreaming and Reality: The Concept of Dayeʔ/ʔlaleʔ Dreams in the Akan Worldview", *International Journal of Dream Research* 18, no. 2 (2025): 169–178 | The dream as part of a web of relations with the living and the dead | **Open** (an open-access journal); check the licence on the PDF |
| Simon Charsley, "Dreams of power: social process in a West African religious movement", *Africa* (1983) | Dreams in a West African church movement | Library |
| Jacob K. Olupona and Rowland Abiodun, eds., *Ifá Divination, Knowledge, Power, and Performance* (Indiana University Press, 2016) | Background on Yoruba divination; no chapter on dreams | Library |

## 5. The Western psychology, with its critiques (carried over)

### Freud, and the critique of Freud

| Text | What it says | Access |
|---|---|---|
| Freud, *The Interpretation of Dreams* (Brill translation, 1913) | The dream as a disguised wish; condensation | **Public domain:** Gutenberg **66048** |
| G. William Domhoff, *The Neurocognitive Theory of Dreaming* (MIT Press, 2022), doi:10.7551/mitpress/14679.001.0001 | Freud's main claims don't hold up against dream-content research; dreams reflect the dreamer's waking concerns | **Open: CC BY-ND** |
| Domhoff, "Why did empirical dream researchers reject Freud?", *Dreaming* 14 (2004): 3–17 | The history of the rejection | Library |
| Adolf Grünbaum, *The Foundations of Psychoanalysis* (University of California Press, 1984) | The philosophical critique: the clinic's evidence can be suggested by the analyst | Library |
| Mark Solms, *The Hidden Spring* (Profile, 2021) | The contemporary defence of some of Freud | Library |

### Jung, and the critique of Jung

| Text | What it says | Access |
|---|---|---|
| C. G. Jung, *Psychology of the Unconscious* (Hinkle translation, 1916) | Myth and dream images as transformations of one psychic energy; the start of the collective unconscious | **Public domain** (US): Gutenberg **65903** |
| Farhad Dalal, "Jung: A Racist", *British Journal of Psychotherapy* 4, no. 3 (1988): 263–79 | Jung's equation of "primitive" minds with "primitive" peoples runs through his theory | Library |
| "Open Letter on the Question of Jung's Writings and Theories about 'Africans'", *BJP* 34, no. 4 (2018) | Jungian analysts asking the field to acknowledge it | **Open** (baatn.org.uk) |
| Frantz Fanon, *Black Skin, White Masks* (1952), chapter 6 | The collective unconscious is one culture's, not humanity's | Library |

**For the card:** a reading from the *Zhougong jiemeng* is not a Jungian reading, and the card shouldn't present Chinese dream symbols as archetypes. The book's omens are about office, wealth, children and illness: a society's concerns, written down. That is closer to Domhoff's "waking concerns" than to Jung.

### Contemporary dream science

| Text | What it says | Access |
|---|---|---|
| Erik Hoel, "The overfitted brain: Dreams evolved to assist generalization", *Patterns* 2, no. 5 (2021), doi:10.1016/j.patter.2021.100244 | Dreams as the brain's own strange pictures, which keep it from overfitting to the day | **Open: CC BY-NC-ND 4.0** |
| J. Allan Hobson and Robert McCarley, "The brain as a dream state generator", *American Journal of Psychiatry* 134 (1977): 1335–48 | Dreams as the forebrain making sense of random activity | Library |
| Antti Revonsuo, "The reinterpretation of dreams", *Behavioral and Brain Sciences* 23 (2000): 877–901 | Dreams as threat rehearsal | Library |

## 6. What to bring into the tool

The card's texts step runs these (the Wikisource addresses fetch each page's text as it is stored, with its few markup lines):

```
data raw txt 'https://zh.wikisource.org/w/index.php?title=%E5%91%A8%E5%85%AC%E8%A7%A3%E5%A4%A2&action=raw' zhougong-jiemeng --license 'public domain (Wikisource: PD-old)'
data raw txt 'https://zh.wikisource.org/w/index.php?title=%E5%88%97%E5%AD%90%2F%E5%91%A8%E7%A9%86%E7%8E%8B%E7%AF%87&action=raw' liezi-zh --license 'public domain (Wikisource)'
data raw txt 'https://en.wikisource.org/w/index.php?title=Taoist_teachings_from_the_book_of_Lieh_Tz%C5%AD/Book_3&action=raw' liezi-dreams --license 'public domain: Lionel Giles, 1912 (Wikisource: PD-US)'
data raw txt 'https://zh.wikisource.org/w/index.php?title=%E6%BD%9B%E5%A4%AB%E8%AB%96%2F%E5%8D%B7%E4%B8%83&action=raw' wangfu-menglie --license 'public domain (Wikisource)'
data raw gutenberg 59709 zhuangzi
data raw gutenberg 66048 freud-dreams
data raw txt https://archive.org/download/cu31924023333077/cu31924023333077_djvu.txt kuunmong --license "public domain: Gale's translation, published 1922"
data raw wikipedia Dream_incubation dream-incubation
```

(On the card, each also carries `--about` and `--page`.) The *Zhougong jiemeng* is the one `dream make` reads; the rest are for the student to read and quote from.

**Licences of the open Chinese texts:** the texts themselves are public domain (ancient works; Wikisource marks the *Zhougong jiemeng* PD-old and Giles's translation PD-US). Wikisource's own pages (its notes and layout) are CC BY-SA 4.0; the card keeps only the text. ctext.org is for reading, not for bringing in.
