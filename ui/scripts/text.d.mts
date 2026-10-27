// Types for text.mjs (plain JavaScript, so Vite's config can load it without a build step).
export interface Entry {
  id: string
  title: string
  text: string
  flag: boolean
  tab: string
}
export const TEXT_DIR: string
export const TAB_FILES: string[]
export function slotsOf(text: string): string[]
export function parseTab(md: string, file: string): Entry[]
export function readTabs(): Entry[]
export function tabFlags(): { id: string; title: string; text: string; tab: string }[]
export function wordsToTs(entries: Entry[]): string
export function checkUses(entries: Entry[]): string[]
export function writeWords(): boolean
export function tabFiles(): string[]
export function checkFlagNames(ids: string[]): string[]
