import type { CardType } from '../../types/card'

/**
 * Registry of card type metadata for rendering decisions.
 */
export interface CardTypeMeta {
  label: string
  defaultWidth: number
  defaultHeight: number
  minWidth: number
  minHeight: number
}

export const cardRegistry: Record<CardType, CardTypeMeta> = {
  data_table: {
    label: 'Data Table',
    defaultWidth: 440,
    defaultHeight: 320,
    minWidth: 300,
    minHeight: 200,
  },
  bar_chart: {
    label: 'Bar Chart',
    defaultWidth: 440,
    defaultHeight: 300,
    minWidth: 300,
    minHeight: 250,
  },
  line_chart: {
    label: 'Line Chart',
    defaultWidth: 440,
    defaultHeight: 300,
    minWidth: 300,
    minHeight: 250,
  },
  alert_summary: {
    label: 'Alert Summary',
    defaultWidth: 400,
    defaultHeight: 320,
    minWidth: 280,
    minHeight: 200,
  },
  text_report: {
    label: 'Text Report',
    defaultWidth: 440,
    defaultHeight: 350,
    minWidth: 300,
    minHeight: 200,
  },
  network_health: {
    label: 'Network Health',
    defaultWidth: 400,
    defaultHeight: 280,
    minWidth: 280,
    minHeight: 200,
  },
}
