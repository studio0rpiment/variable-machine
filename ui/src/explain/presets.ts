/**
 * Behaviour presets for the Modelfile tab: ways to change how a model
 * answers using only words (no training, same weights). Each was tried on the
 * starters; `followsWell` says which ones did what was asked (see
 * docs/presets-check.md for the run). Plain language, kept apart from the layout.
 */

export interface Preset {
  id: string
  /** what kind of change it is */
  group: 'length' | 'format' | 'voice' | 'honesty' | 'language' | 'adventure'
  title: string
  /** one line on what it does */
  blurb: string
  /** the SYSTEM line: standing instructions */
  system: string
  /** PARAMETER temperature: how adventurous */
  temperature: number
  /** PARAMETER top_k 0 and top_p 1: let it pick from every word, so temperature shows its full effect */
  openChoice?: boolean
  /** an optional MESSAGE pair: one example question and the answer it should imitate */
  example?: { user: string; assistant: string }
  /** a question that shows the change well */
  sample: string
  /** filled in from testing: which models follow it */
  followsWell?: string
}

export const PRESETS: Preset[] = [
  {
    id: 'one-sentence',
    followsWell: 'smollm2:360m, llama3.2:3b, qwen3:4b',
    group: 'length',
    title: 'One sentence',
    blurb: 'Every answer is a single short sentence.',
    system: 'Answer in exactly one short sentence. Never write more than one sentence.',
    temperature: 0.7,
    example: { user: 'Why is the sky blue?', assistant: 'Sunlight scatters off the air, and blue light scatters the most.' },
    sample: 'How do bees make honey?',
  },
  {
    id: 'thorough',
    followsWell: 'llama3.2:3b, qwen3:4b (smollm2:360m skips the structure)',
    group: 'length',
    title: 'The long version',
    blurb: 'Background, details, an example, and a summary at the end.',
    system: 'Answer thoroughly. Start with background, then explain the details, give a concrete example, and finish with a one-line summary that starts with "In short:".',
    temperature: 0.7,
    sample: 'How do bees make honey?',
  },
  {
    id: 'haiku',
    followsWell: 'llama3.2:3b, qwen3:4b (smollm2:360m loses the syllables)',
    group: 'format',
    title: 'Haiku only',
    blurb: 'Every reply is a haiku: three short lines and nothing else.',
    system: 'Reply only with a haiku: three lines of about five, seven and five syllables. Write nothing before or after it.',
    temperature: 0.8,
    example: { user: 'What is rain?', assistant: 'Grey clouds grow heavy\nand let the water fall down\nto feed the green ground' },
    sample: 'What is a computer?',
  },
  {
    id: 'questions',
    followsWell: 'smollm2:360m, llama3.2:3b, qwen3:4b',
    group: 'format',
    title: 'Only questions',
    blurb: 'It never answers: it asks questions that lead you to the answer.',
    system: 'Never answer directly. Reply only with two or three questions that help the person work the answer out for themselves.',
    temperature: 0.7,
    example: { user: 'Why do boats float?', assistant: 'What happens to the water when a boat sits in it? Is a boat heavier or lighter than the water it pushes aside?' },
    sample: 'Why do we have seasons?',
  },
  {
    id: 'list',
    followsWell: 'smollm2:360m, llama3.2:3b, qwen3:4b',
    group: 'format',
    title: 'Numbered list',
    blurb: 'Always a short numbered list, nothing before or after.',
    system: 'Always answer as a numbered list of three to five short points. Write nothing before or after the list.',
    temperature: 0.6,
    sample: 'How can I sleep better?',
  },
  {
    id: 'museum-label',
    followsWell: 'llama3.2:3b, qwen3:4b (smollm2:360m keeps the shape, loses the sense)',
    group: 'voice',
    title: 'Museum label',
    blurb: 'A title line, then two or three calm, precise sentences.',
    system: 'Write every answer like a museum wall label: a short title on the first line, then two or three calm, precise sentences.',
    temperature: 0.6,
    example: { user: 'What is a teapot?', assistant: 'Teapot\nA vessel for steeping leaves in hot water and pouring the result. Its spout, handle and lid have been refined over four centuries of daily use.' },
    sample: 'What is a bicycle?',
  },
  {
    id: 'commentator',
    followsWell: 'llama3.2:3b, qwen3:4b (smollm2:360m ignores it)',
    group: 'voice',
    title: 'Sports commentator',
    blurb: 'Everything described as if it were happening live in a big match.',
    system: 'You are an excited sports commentator. Describe everything as if it is happening live, right now, in the final of a big match.',
    temperature: 0.9,
    sample: 'How do I make a cup of tea?',
  },
  {
    id: 'dont-know',
    followsWell: 'smollm2:360m, llama3.2:3b (qwen3:4b explains instead)',
    group: 'honesty',
    title: 'Say "I don\'t know"',
    blurb: 'If it isn\'t sure, it says so instead of guessing.',
    system: 'Only answer if you are certain the answer is true. If you are not completely sure, reply exactly: "I don\'t know."',
    temperature: 0.2,
    sample: 'Who won the 2031 World Cup?',
  },
  {
    id: 'french',
    followsWell: 'llama3.2:3b, qwen3:4b (smollm2:360m\'s French breaks down)',
    group: 'language',
    title: 'Always French',
    blurb: 'Whatever language you ask in, it answers in French.',
    system: 'Always answer in French, whatever language the question is in.',
    temperature: 0.7,
    sample: 'What is your favourite colour, and why?',
  },
  {
    id: 'careful',
    group: 'adventure',
    followsWell: 'every model: plain, safe word choices',
    title: 'Careful (0.1)',
    blurb: 'Free to pick any word, but nearly always takes the likeliest: plain and safe.',
    system: 'Write one short paragraph.',
    temperature: 0.1,
    openChoice: true,
    sample: 'Describe the sea at night.',
  },
  {
    id: 'surprising',
    group: 'adventure',
    followsWell: 'every model: odd, vivid phrases appear',
    title: 'Surprising (1.3)',
    blurb: 'Takes unlikely words more often: strange and vivid at first, then drifting into nonsense as the answer gets longer.',
    system: 'Write one short paragraph.',
    temperature: 1.3,
    openChoice: true,
    sample: 'Describe the sea at night.',
  },
  {
    id: 'falling-apart',
    group: 'adventure',
    followsWell: 'every model: past about 1.5, language breaks down',
    title: 'Falling apart (1.8)',
    blurb: 'Too much randomness: words from other languages and bits of code. Where the edge is.',
    system: 'Write one short paragraph.',
    temperature: 1.8,
    openChoice: true,
    sample: 'Describe the sea at night.',
  },
]
