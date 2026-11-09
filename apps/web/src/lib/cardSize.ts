export type CardSize = 'small' | 'wide' | 'tall' | 'feature'

export interface CardContent {
  title: string
  preview: string | null
  imageAspect?: number | null
}

const LONG_TITLE = 80
const LONG_PREVIEW = 150
const FEATURE_PREVIEW = 100
const LANDSCAPE = 1.6

export function cardSize({ title, preview, imageAspect }: CardContent): CardSize {
  const previewLength = preview?.length ?? 0

  if (imageAspect === null) {
    return title.length > LONG_TITLE || previewLength > LONG_PREVIEW ? 'wide' : 'small'
  }

  // Until the image has loaded, assume a typical landscape cover image.
  const landscape = (imageAspect ?? LANDSCAPE) >= LANDSCAPE
  return landscape && previewLength >= FEATURE_PREVIEW ? 'feature' : 'tall'
}

export const cardSpanClass: Record<CardSize, string> = {
  small: '',
  wide: 'sm:col-span-2',
  tall: 'sm:row-span-2',
  feature: 'sm:col-span-2 sm:row-span-2',
}
