/** True when value looks like Frappe Text Editor / Quill HTML. */
export function isHtmlContent(value: string | null | undefined): boolean {
  if (value == null || value === '') return false
  return /<[a-z][\s\S]*>/i.test(String(value).trim())
}

/** Show Text Editor / HTML description fields as readable plain text in the portal UI. */
export function htmlToPlainText(html: string | null | undefined): string {
  if (html == null || html === '') return ''
  let text = String(html)
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<\/p>\s*/gi, '\n')
  text = text.replace(/<p[^>]*>/gi, '')
  text = text.replace(/<[^>]+>/g, '')
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  text = text.replace(/\n{3,}/g, '\n\n')
  return text.trim()
}
