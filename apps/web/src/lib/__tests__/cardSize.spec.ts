import { describe, expect, it } from 'vitest'
import { cardSize } from '../cardSize.ts'

const text = (length: number) => 'x'.repeat(length)

describe('cardSize', () => {
  describe('without an image (imageAspect: null)', () => {
    it('is small for a short title and preview', () => {
      expect(cardSize({ title: text(80), preview: text(150), imageAspect: null })).toBe('small')
      expect(cardSize({ title: 'Hi', preview: null, imageAspect: null })).toBe('small')
    })

    it('is wide for a title over 80 characters', () => {
      expect(cardSize({ title: text(81), preview: null, imageAspect: null })).toBe('wide')
    })

    it('is wide for a preview over 150 characters', () => {
      expect(cardSize({ title: 'Hi', preview: text(151), imageAspect: null })).toBe('wide')
    })
  })

  describe('with an image', () => {
    it('is a feature for a landscape image and a preview of at least 100 characters', () => {
      expect(cardSize({ title: 'Hi', preview: text(100), imageAspect: 2 })).toBe('feature')
    })

    it('treats an aspect ratio of exactly 1.6 as landscape', () => {
      expect(cardSize({ title: 'Hi', preview: text(100), imageAspect: 1.6 })).toBe('feature')
      expect(cardSize({ title: 'Hi', preview: text(100), imageAspect: 1.59 })).toBe('tall')
    })

    it('is tall when the preview is short or missing', () => {
      expect(cardSize({ title: 'Hi', preview: text(99), imageAspect: 2 })).toBe('tall')
      expect(cardSize({ title: 'Hi', preview: null, imageAspect: 2 })).toBe('tall')
    })

    it('is tall for a portrait or square image, however long the preview', () => {
      expect(cardSize({ title: 'Hi', preview: text(300), imageAspect: 1 })).toBe('tall')
    })

    it('assumes a landscape image until its size is known (imageAspect unset)', () => {
      expect(cardSize({ title: 'Hi', preview: text(100) })).toBe('feature')
      expect(cardSize({ title: 'Hi', preview: text(10) })).toBe('tall')
    })
  })
})
