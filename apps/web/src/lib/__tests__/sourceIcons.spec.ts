import { readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sourceIcon } from '../sourceIcons.ts'

/** Source ids the scraper has (or has reserved a badge colour for). */
const KNOWN_IDS = ['devto', 'stackoverflow', 'hackernews', 'github', 'reddit', 'lobsters']

/**
 * The design tokens in main.css, e.g. token('canvas') -> '#0f110e'. Read as plain text:
 * importing the file through Vite would give Tailwind's compiled output instead.
 */
const css = readFileSync(resolvePath(import.meta.dirname, '../../assets/main.css'), 'utf8')
function token(name: string): string {
  const match = new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(css)
  if (!match) throw new Error(`--color-${name} not found in main.css`)
  return match[1]!
}

/** A colour as the icon will paint it: a hex value, or a var(--color-*) design token. */
function resolve(color: string): string {
  const variable = /^var\(--color-([a-z]+)\)$/.exec(color)
  return variable ? token(variable[1]!) : color
}

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light! + 0.05) / (dark! + 0.05)
}

describe('sourceIcon', () => {
  it.each(KNOWN_IDS)('has a logo for %s', (id) => {
    const icon = sourceIcon(id)

    expect(icon).not.toBeNull()
    expect(icon!.path.length).toBeGreaterThan(50)
  })

  it.each(KNOWN_IDS)('gives %s well-formed path data in a 24x24 box', (id) => {
    const { path } = sourceIcon(id)!

    expect(path).toMatch(/^M[-\d.]/)
    expect(path).toMatch(/^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s-]+$/)
  })

  it('returns null for a source it has no logo for, so the caller can fall back', () => {
    expect(sourceIcon('mastodon')).toBeNull()
    expect(sourceIcon('')).toBeNull()
  })

  it('does not match inherited object keys', () => {
    expect(sourceIcon('constructor')).toBeNull()
    expect(sourceIcon('toString')).toBeNull()
  })

  it('gives every logo a different shape', () => {
    const paths = KNOWN_IDS.map((id) => sourceIcon(id)!.path)

    expect(new Set(paths).size).toBe(KNOWN_IDS.length)
  })

  describe('colour', () => {
    it.each(KNOWN_IDS)('is a hex value or a design token for %s', (id) => {
      expect(sourceIcon(id)!.color).toMatch(/^(#[0-9a-f]{6}|var\(--color-[a-z]+\))$/i)
    })

    it.each(KNOWN_IDS)('stands out against the page background for %s (WCAG 3:1)', (id) => {
      const color = resolve(sourceIcon(id)!.color)

      expect(contrast(color, token('canvas'))).toBeGreaterThanOrEqual(3)
    })

    it('uses the light ink colour for brands whose own colour is near-black', () => {
      expect(sourceIcon('github')!.color).toBe('var(--color-ink)')
      expect(sourceIcon('devto')!.color).toBe('var(--color-ink)')
    })

    it("keeps the brand's orange for Hacker News and Stack Overflow", () => {
      expect(sourceIcon('hackernews')!.color.toLowerCase()).toBe('#ff6600')
      expect(sourceIcon('stackoverflow')!.color.toLowerCase()).toBe('#f58025')
    })
  })
})
