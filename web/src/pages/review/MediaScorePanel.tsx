import { useState } from 'react'
import { Button, InputNumber, Space } from 'antd'
import type { MediaScoringDimension } from '../../types'

interface MediaScorePanelProps {
  dimensions: MediaScoringDimension[]
  maxScore: number
  disabled?: boolean
  onScore: (score: number) => void
}

/**
 * Dimension-based scoring for media answers (R-05): the grader rates each
 * dimension 0-100, the weighted sum fills the score box on demand.
 */
export default function MediaScorePanel({ dimensions, maxScore, disabled, onScore }: MediaScorePanelProps) {
  const [scores, setScores] = useState<Record<string, number | null>>({})

  const weightTotal = dimensions.reduce((sum, item) => sum + (Number(item.weight) || 0), 0)
  const filled = dimensions.every((item) => scores[item.name] != null)

  const weighted = (() => {
    if (!filled || weightTotal <= 0) return null
    const total = dimensions.reduce(
      (sum, item) => sum + ((scores[item.name] ?? 0) / 100) * maxScore * ((Number(item.weight) || 0) / weightTotal),
      0,
    )
    return Math.round(total * 100) / 100
  })()

  return (
    <div className="media-score-panel">
      {dimensions.map((item) => (
        <Space key={item.name} align="center" className="media-score-row">
          <span className="media-score-name">
            {item.name}
            <span className="cell-meta">（权重 {item.weight}%）</span>
          </span>
          <InputNumber
            min={0}
            max={100}
            value={scores[item.name] ?? undefined}
            disabled={disabled}
            placeholder="0-100"
            onChange={(value) =>
              setScores((current) => ({ ...current, [item.name]: value === null ? null : Number(value) }))
            }
          />
        </Space>
      ))}
      <Button
        type="primary"
        ghost
        size="small"
        disabled={disabled || weighted === null}
        onClick={() => weighted !== null && onScore(weighted)}
      >
        按维度合计填入得分{weighted !== null ? `（${weighted} 分）` : ''}
      </Button>
    </div>
  )
}
