# The share tab

The words on the share tab are moving here, a part at a time; so far, what it says about packaging a relevance judge (the research bot). The rest are still in `ui/src/components/SharePanel.tsx` and `ui/src/explain/flags.md`. Edit the words here: `npm run dev` rebuilds the page when you save. Each entry is a `###` title, its name in backticks on the next line (don't change it), then its text; a word in braces, like `{model}`, is filled in by the page.

## Packages

### Heading
`share.packages.title`

packages · a model that asks a table, or judges what's relevant, to take into another project

### A relevance judge's package
`share.judge.about`

A relevance judge, trained on your keep and skip decisions in Data → papers and articles, packages the same way with research.js instead of ask.js: run it with Node and it searches again, drops what you've seen, has the judge read the closest, and writes a reading list and BibTeX.

### A judge's badge
`share.judge.badge`

judges relevance

### A judge, packaged
`share.judge.made`

workspace/packages/{model}: node research.js in it, or zip it

### No judge yet
`share.judge.none`

no relevance judge yet: in Data, search for papers and articles, decide keep or skip, make a training set from the decisions, train it, export it, and it appears here
