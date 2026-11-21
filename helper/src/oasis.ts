import fs from 'node:fs/promises'
import path from 'node:path'
import { WORKSPACE } from './config.ts'
import { broadcast, print } from './hub.ts'
import { spawnStreamed } from './run.ts'
import { parseCsv } from './shared/rowShapes.ts'
import type { DatasetManifest } from './shared/manifest.ts'

/**
 * `data import oasis <name>`: OASIS, the Open Affective Standardized Image Set
 * (Kurdi, Lozano & Banaji, 2017), as a picture dataset of moods.
 *
 * OASIS is 900 photos, each rated by about 100 people for valence (how
 * pleasant, 1 to 7) and arousal (how calm or stirred up, 1 to 7). Its photos
 * come from Pixabay, Wikimedia and Flickr under open licenses; each photo's
 * source is kept in the manifest.
 *
 * What a picture conveys, not what a person feels: the Person category (346
 * photos, mostly faces and bodies) is left out, and so are the themes in the
 * other categories whose photos are mostly of people (PEOPLE_THEMES). A theme
 * like War, Funeral or Wedding is a scene of people, so it goes too.
 *
 * Each photo's two ratings become one of four moods, the four quarters of
 * Russell's circumplex (valence across, arousal up):
 *   calm    pleasant, low arousal     lively  pleasant, high arousal
 *   sombre  unpleasant, low arousal   tense   unpleasant, high arousal
 * Pleasant is above the scale's middle (4). High arousal is above the median
 * of the photos kept, because OASIS's photos are mostly rated calm: with the
 * scale's middle, three in four would be "low".
 *
 * OASIS includes unpleasant photos (a carcass, a crash, a bloody knife): they
 * are what the unpleasant moods are learned from.
 */

const ZIP_URL = 'https://osf.io/download/uxvpb/'
const PAGE = 'https://osf.io/6pnd7/'
const PAPER = 'Kurdi, B., Lozano, S., & Banaji, M. R. (2017). Introducing the Open Affective Standardized Image Set (OASIS). Behavior Research Methods, 49(2), 457–470. https://doi.org/10.3758/s13428-016-0715-3'
export const OASIS_LICENSE = 'OASIS: free of charge for research, as its authors state; no license on the set; each photo keeps its source\'s open license (Pixabay, Wikimedia, Flickr Creative Commons) · student project only'
export const MOOD_QUESTION = 'What mood does this picture convey?'

/** Themes outside the Person category whose photos are mostly of people: left out. */
const PEOPLE_THEMES = new Set([
  'Birthday', 'Celebration', 'Couple', 'Funeral', 'Happy pose', 'Neutral pose', 'Performance', 'Soccer', 'Soldiers', 'War', 'Wedding',
  'Parachuting', 'Parasailing', 'Skydiving', 'Skijump', 'Horse racing', 'Research', 'Bar', 'Jail', 'Prison',
])

const exists = (p: string) => fs.access(p).then(() => true, () => false)
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

export async function importOasis(name: string, line: string): Promise<boolean> {
  const dir = path.join(WORKSPACE, 'data', name)
  if (await exists(dir)) return print(`${name} already exists`), false
  const raw = path.join(WORKSPACE, 'raw', 'oasis')
  const zip = path.join(raw, 'OASIS.zip')
  if (await exists(zip)) print('  using workspace/raw/oasis/OASIS.zip (downloaded earlier)')
  else {
    print(`  OASIS (${PAGE}): 900 rated photos, about 92 MB`)
    print(`▸ curl -fL --progress-bar --create-dirs -o workspace/raw/oasis/OASIS.zip.part ${ZIP_URL}`)
    if (!(await spawnStreamed('curl', ['-fL', '--progress-bar', '--create-dirs', '-o', 'workspace/raw/oasis/OASIS.zip.part', ZIP_URL]))) return print('  the download stopped; run it again to start over'), false
    await fs.rename(`${zip}.part`, zip)
  }
  // only the ratings and the photos; unzip refuses paths that climb out (..)
  const into = path.join(raw, 'unpacked')
  await fs.rm(into, { recursive: true, force: true })
  print('▸ unzip -q -o workspace/raw/oasis/OASIS.zip OASIS.csv images/*.jpg -d workspace/raw/oasis/unpacked')
  if (!(await spawnStreamed('unzip', ['-q', '-o', 'workspace/raw/oasis/OASIS.zip', 'OASIS.csv', 'images/*.jpg', '-d', 'workspace/raw/oasis/unpacked']))) return false

  const text = new TextDecoder('latin1').decode(await fs.readFile(path.join(into, 'OASIS.csv')))
  const all = parseCsv(text)
    .filter((r) => r.Theme && r.Arousal_mean)
    .map((r) => ({ theme: r.Theme.trim(), category: r.Category, source: r.Source, valence: Number(r.Valence_mean), arousal: Number(r.Arousal_mean) }))
  const person = all.filter((r) => r.category === 'Person').length
  const themed = all.filter((r) => r.category !== 'Person' && PEOPLE_THEMES.has(r.theme.replace(/\s*\d+$/, ''))).length
  const kept = all.filter((r) => r.category !== 'Person' && !PEOPLE_THEMES.has(r.theme.replace(/\s*\d+$/, '')))
  const high = median(kept.map((r) => r.arousal))
  const mood = (r: (typeof kept)[number]) => (r.valence > 4 ? (r.arousal > high ? 'lively' : 'calm') : r.arousal > high ? 'tense' : 'sombre')
  print(`  ${all.length} photos: left out ${person} in the Person category and ${themed} of people in other themes; ${kept.length} kept`)
  print(`  moods: pleasant above 4 (the scale's middle), high arousal above ${high.toFixed(2)} (the median of those kept)`)

  await fs.mkdir(path.join(dir, 'images'), { recursive: true })
  const lines: string[] = []
  const ratings = ['file,theme,category,source,valence,arousal,mood']
  const photos: NonNullable<DatasetManifest['photos']> = []
  const counts: Record<string, number> = {}
  for (const r of kept) {
    const file = `images/oasis--${slug(r.theme)}.jpg`
    const from = path.join(into, 'images', `${r.theme}.jpg`)
    if (!(await exists(from))) {
      print(`  no photo for ${r.theme}; skipped`)
      continue
    }
    await fs.rename(from, path.join(dir, file))
    const m = mood(r)
    counts[m] = (counts[m] ?? 0) + 1
    lines.push(JSON.stringify({ images: [file], messages: [{ role: 'user', content: MOOD_QUESTION }, { role: 'assistant', content: m }] }))
    ratings.push([file, `"${r.theme}"`, r.category, `"${r.source}"`, r.valence.toFixed(3), r.arousal.toFixed(3), m].join(','))
    photos.push({ file, from: `${PAGE} (OASIS.zip, ${r.theme}.jpg)`, license: `as its source states: ${r.source}`, author: r.source })
  }
  await fs.rm(into, { recursive: true, force: true })
  await fs.writeFile(path.join(dir, 'train.jsonl'), lines.join('\n') + '\n')
  await fs.writeFile(path.join(dir, 'valid.jsonl'), '')
  await fs.writeFile(path.join(dir, 'ratings.csv'), ratings.join('\n') + '\n')
  const labels = Object.keys(counts).sort()
  const m: DatasetManifest = {
    name,
    kind: 'dataset',
    created: new Date().toISOString(),
    license: OASIS_LICENSE,
    inputs: [ZIP_URL],
    command: [line],
    format: 'picture',
    counts: { train: lines.length, valid: 0 },
    split: null,
    sources: [{ id: 'OASIS', kind: 'import', license: OASIS_LICENSE, licenseChecked: false, url: PAGE, rows: lines.length, about: PAPER }],
    photos,
    about: `${lines.length} photos from OASIS with no people in them, each labelled with the mood about 100 people rated it as conveying: ${labels.map((l) => `${l} ${counts[l]}`).join(', ')}. The ratings are in ratings.csv.`,
    mood: { labels, from: 'OASIS valence and arousal ratings', pleasantAbove: 4, highArousalAbove: Number(high.toFixed(3)), leftOut: { person, peopleThemes: [...PEOPLE_THEMES] } },
  }
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(m, null, 2) + '\n')
  // raw/oasis keeps only the zip, so the next import needn't download it; the dataset's manifest says where it came from
  broadcast({ type: 'workspace.changed', path: `data/${name}/manifest.json`, kind: 'add' })
  print(`  ◂ workspace/data/${name}: ${lines.length} picture rows · ${labels.map((l) => `${l} ${counts[l]}`).join(' · ')}`)
  print(`  next: data split ${name} --valid 0.2`)
  return true
}
