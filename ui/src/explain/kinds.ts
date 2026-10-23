/**
 * "What kinds of models are there?": the general map shown in an accordion on
 * the Models tab. Plain language; kept apart from the layout so it can be
 * edited in one place. Everything in Variable Machine is the first kind.
 */

export interface Kind {
  name: string
  text: string
}

export const KINDS_INTRO =
  'Models can be sorted two ways: by what they take in and give out, and by what job they are tuned for. Variable Machine gives each kind it works with a one-word name, the same word its tab uses. Most of what you change here writes: text in, text out. The image tools look.'

export const BY_INPUT: Kind[] = [
  { name: 'Text to text', text: 'Language models: chat, writing, summarising, answering questions. The kind that writes, and most of what you change here.' },
  { name: 'Code', text: 'Text models specialised in programming: writing, explaining and fixing code.' },
  { name: 'Maths and reasoning', text: 'Tuned to work through problems step by step, including mathematical notation and proofs.' },
  { name: 'Translation', text: 'Built to move text between languages, often better at it than a general chat model.' },
  { name: 'Image understanding', text: 'An image plus a question in, words out: describe a picture, read a chart, read printed or handwritten text.' },
  { name: 'Image generation', text: 'Words in, an image out, plus editing: filling in, extending, changing a style.' },
  { name: 'Video', text: 'Making video from words or images, and making sense of video: describing it, searching it.' },
  { name: 'Speech to text', text: 'Recordings in, a transcript out, sometimes translated as well.' },
  { name: 'Text to speech', text: 'Words in, a spoken voice out, sometimes a copy of a particular voice.' },
  { name: 'Music and sound', text: 'Making music or sound effects, pulling the instruments in a recording apart, tagging audio.' },
  { name: '3D', text: 'Making 3D models, scenes or textures from words or pictures.' },
  { name: 'Embeddings', text: 'Text or images in, a list of numbers out, so a computer can find things by meaning rather than by matching words. They power search. They do not talk.' },
  { name: 'Classification and detection', text: 'Sorting things into kinds: spam or not, which object is where in a photo, whose face this is.' },
  { name: 'Science', text: 'Specialised data: protein shapes, weather, materials, medical scans, readings from sensors over time.' },
  { name: 'Action', text: 'Deciding what to do rather than what to say: moving a robot arm, clicking through software.' },
]

export const COMPUTER_VISION = {
  name: 'Where computer vision fits',
  text: 'Computer vision is not one slot on that list: it is the whole field of models that take in images or video and make sense of them. It covers detection (finding what is where), segmentation (which pixels belong to what), pose (where a body\'s joints are), tracking movement through video, reading text in images, and rebuilding 3D from photos. Classic computer vision models such as YOLO do one job each, fast, and give back boxes, masks, labels or coordinates rather than sentences.',
}

export const BY_JOB: Kind[] = [
  { name: 'General assistant', text: 'Broad and conversational.' },
  { name: 'Instruction-following or base', text: 'Tuned to follow requests, or the raw model that only continues text.' },
  { name: 'Reasoning', text: 'Spends effort working a problem out in writing before answering.' },
  { name: 'Tool-using', text: 'Can ask other programs to do things for it: search, calculate, run code.' },
  { name: 'Small or on-device', text: 'Built to run on phones and laptops, like SmolLM2.' },
  { name: 'Domain-tuned', text: 'Changed for one area or voice: law, medicine, a company\'s documents, a style. This is what you do when you train an adapter here.' },
  {
    name: 'Hybrid',
    text: 'One model working across more than one kind of input or output. Computer vision is the familiar way in. A computer vision model sees: it finds the objects and labels them. Join it to a language model and you get a hybrid that sees and talks: you can ask about a picture in words, and it answers in sentences. Add hearing and you get models that listen and speak. Each is a model that sees or hears, joined to a model that talks, and the language models you change here are that talking half.',
  },
]
