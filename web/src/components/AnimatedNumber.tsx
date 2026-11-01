import { useCountUp } from '../hooks/useCountUp'

interface Props {
  value: number
  decimals?: number
  suffix?: string
  prefix?: string
}

const formatter = (decimals: number) =>
  new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

/** KPI number with a one-shot count-up; formatting stays locale-aware. */
export default function AnimatedNumber({ value, decimals = 0, suffix = '', prefix = '' }: Props) {
  const display = useCountUp(value)
  return (
    <span className="animated-number">
      {prefix}
      {formatter(decimals).format(display)}
      {suffix}
    </span>
  )
}
