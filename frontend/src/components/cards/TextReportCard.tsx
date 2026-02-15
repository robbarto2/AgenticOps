import ReactMarkdown from 'react-markdown'
import type { TextReportCard as TextReportCardType } from '../../types/card'

interface Props {
  data: TextReportCardType['data']
}

export function TextReportCard({ data }: Props) {
  return (
    <div className="prose dark:prose-invert prose-sm max-w-none max-h-96 overflow-y-auto text-sm leading-relaxed text-gray-900 dark:text-gray-100">
      <ReactMarkdown>{data.content}</ReactMarkdown>
    </div>
  )
}
