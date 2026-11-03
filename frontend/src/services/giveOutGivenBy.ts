/** Titles / honorifics that use a trailing period and must stay in the giver name. */
const GIVER_TITLE = /^(Dr|Mr|Mrs|Ms|Miss|Prof|Sr|Jr|S\/N|s\/n)\.?$/i
/** Single-letter initial such as ``A.`` in ``A. Smith``. */
const GIVER_INITIAL = /^[A-Za-z]\.?$/

/**
 * Truncate legacy ``given by …`` text to the person name only.
 * Keeps ``Dr. Jane`` / ``A. Smith``; cuts before ``, DC``, ``as per``, or a real new sentence.
 */
export function cutGiveOutGiverName(raw: string): string {
  let name = (raw || '').trim()
  if (!name) return ''

  const hard = name.search(/\s*(?:,|;|\n|\.?\s*DC\b|\bas per\b|\bnext\b|\bpatient\b)/i)
  if (hard > 0) name = name.slice(0, hard).trim()

  const sentenceEnd = /\.\s+(?=[A-Z])/g
  let match: RegExpExecArray | null
  while ((match = sentenceEnd.exec(name)) !== null) {
    const before = name.slice(0, match.index)
    const lastToken = before.split(/\s+/).pop() || ''
    if (GIVER_TITLE.test(lastToken) || GIVER_INITIAL.test(lastToken)) {
      continue
    }
    name = before.trim()
    break
  }

  // Drop a trailing sentence period, but keep title/initial periods (Dr. / A.).
  if (/\.$/.test(name)) {
    const lastToken = name.split(/\s+/).pop() || ''
    if (!GIVER_TITLE.test(lastToken) && !GIVER_INITIAL.test(lastToken)) {
      name = name.replace(/\.$/, '').trim()
    }
  }
  return name.trim()
}

/**
 * Prefer the linked User on the give-out. When legacy rows have no user
 * (Oracle VISIT_00_04), fall back to a name typed in remarks as "given by …".
 *
 * Only the giver name is returned — never the rest of the clinical note.
 * Callers that mask clinical details must pass ``allowNotesFallback=false``.
 */
export function resolveGiveOutGivenBy(
  user?: string | null,
  notes?: string | null,
  allowNotesFallback: boolean = true,
): string {
  const fromUser = (user || '').trim()
  if (fromUser) return fromUser
  if (!allowNotesFallback) return ''

  const text = (notes || '').trim()
  if (!text) return ''

  const match = text.match(/given\s+by\s+(.+)/i)
  if (!match) return ''

  return cutGiveOutGiverName(match[1])
}
