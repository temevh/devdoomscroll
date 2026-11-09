const DEVTO_PLACEHOLDER = /dev\.to\/dynamic\/image\/width=1200,height=627[,/]/

export function cardImage(url: string | null): string | null {
  if (!url || DEVTO_PLACEHOLDER.test(url)) return null
  return url
}
