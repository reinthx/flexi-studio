/**
 * Replaces {token} placeholders in a template string with values from a map.
 * Unknown tokens are left as-is. Empty token values are removed cleanly.
 */
export function renderTemplate(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{(\w+[%]?)\}/g, (match, key) => {
    const val = tokens[key]
    return val !== undefined ? val : match
  }).replace(/\s{2,}/g, ' ').trim()
}
