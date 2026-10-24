// Types for flags.mjs (plain JavaScript, so Vite's config can load it without a build step).
import type { Plugin } from 'vite'
export interface Flag {
  id: string
  title: string
  text: string
}
export const FLAGS_MD: string
export function parseFlags(md: string): Flag[]
export function flagsToTs(flags: Flag[]): string
export function writeFlags(): boolean
export function flagsPlugin(): Plugin
