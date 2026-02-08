import ReactMarkdown from 'react-markdown'
import type { TextReportCard as TextReportCardType } from '../../types/card'

interface Props {
  data: TextReportCardType['data']
}

export function TextReportCard({ data }: Props) {
  return (
    <div className="prose prose-invert prose-xs max-w-none max-h-64 overflow-y-auto px-1 text-xs leading-relaxed text-gray-300">
      <ReactMarkdown>{data.content}</ReactMarkdown>
    </div>
  )
}
