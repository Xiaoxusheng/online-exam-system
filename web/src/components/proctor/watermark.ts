/**
 * Tileable exam watermark (M-03): candidate name + ticket number + time, baked
 * into a data-URL SVG background so a screenshot always carries the identity.
 */
export function watermarkDataUrl(lines: string[]): string {
  const text = lines.filter(Boolean).join(' · ')
  const safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="220">`,
    `<text x="24" y="120" font-size="15" fill="rgba(17,17,20,0.055)" font-family="sans-serif" transform="rotate(-18 180 110)">${safe}</text>`,
    `</svg>`,
  ].join('')
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

/** Naive mobile detection for the terminal restriction (C-12). */
export function isMobileClient(): boolean {
  return /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(navigator.userAgent)
}
