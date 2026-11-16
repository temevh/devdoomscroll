import { describe, expect, it } from 'vitest'
import { cardImage } from '../postImage.ts'

describe('cardImage', () => {
  it('returns null when the post has no image', () => {
    expect(cardImage(null)).toBeNull()
    expect(cardImage('')).toBeNull()
  })

  it('passes ordinary image URLs through', () => {
    expect(cardImage('https://example.com/cover.png')).toBe('https://example.com/cover.png')
  })

  // dev.to generates a generic 1200x627 card when an author sets no cover image
  it.each([
    'https://dev.to/dynamic/image/width=1200,height=627,fit=cover/https%3A%2F%2Fexample.com%2Fa.png',
    'https://media2.dev.to/dynamic/image/width=1200,height=627,fit=cover,gravity=auto/x.png',
    'https://dev.to/dynamic/image/width=1200,height=627/x.png',
  ])('hides the dev.to placeholder image: %s', (url) => {
    expect(cardImage(url)).toBeNull()
  })

  it('keeps dev.to images of any other size', () => {
    const url = 'https://media2.dev.to/dynamic/image/width=1000,height=420,fit=cover/x.png'
    expect(cardImage(url)).toBe(url)

    const almost = 'https://dev.to/dynamic/image/width=1200,height=6270,fit=cover/x.png'
    expect(cardImage(almost)).toBe(almost)
  })
})
