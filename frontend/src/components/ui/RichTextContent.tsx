import { isHtmlContent } from '../../utils/htmlToPlainText'

const RICH_TEXT_CLASS =
  'max-w-none text-sm text-slate-800 leading-relaxed ' +
  '[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 ' +
  '[&_li]:mb-2 [&_li]:leading-relaxed [&_strong]:font-semibold ' +
  '[&_strong]:text-slate-900 [&_em]:italic [&_p]:mb-2.5'

interface RichTextContentProps {
  value: string
  className?: string
}

/** Render Frappe Text Editor HTML or fall back to plain pre-wrapped text. */
export function RichTextContent({ value, className = '' }: RichTextContentProps) {
  if (!value) return <span className="text-slate-400">—</span>

  if (isHtmlContent(value)) {
    return (
      <div
        className={`${RICH_TEXT_CLASS} ${className}`}
        dangerouslySetInnerHTML={{ __html: value }}
      />
    )
  }

  return (
    <div className={`whitespace-pre-wrap font-sans text-sm text-slate-800 leading-relaxed ${className}`}>
      {value}
    </div>
  )
}
