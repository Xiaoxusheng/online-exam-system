import { useEffect, useState } from 'react'
import { Alert, Button, Descriptions, Modal, Spin, Tag } from 'antd'
import { CheckCircleFilled, CloseCircleFilled } from '@ant-design/icons'

interface DeviceCheckModalProps {
  open: boolean
  onClose: () => void
}

type CheckState = 'pending' | 'ok' | 'fail'

interface CheckResult {
  camera: CheckState
  microphone: CheckState
  browser: CheckState
  network: CheckState
  latencyMs: number | null
  detail: string
}

/** 考前设备自检（E-05）：纯前端检测，不上报、不阻断进入考试。 */
export default function DeviceCheckModal({ open, onClose }: DeviceCheckModalProps) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<CheckResult | null>(null)

  useEffect(() => {
    if (!open) return
    setRunning(false)
    setResult(null)
  }, [open])

  async function run() {
    setRunning(true)
    const outcome: CheckResult = {
      camera: 'pending',
      microphone: 'pending',
      browser: 'pending',
      network: 'pending',
      latencyMs: null,
      detail: '',
    }

    // 浏览器能力
    const modern = typeof navigator.mediaDevices?.getUserMedia === 'function' && typeof window.WebSocket === 'function'
    outcome.browser = modern ? 'ok' : 'fail'
    if (!modern) outcome.detail = '浏览器过旧，建议使用最新版 Edge / Chrome'

    // 摄像头与麦克风（一次授权同时覆盖）
    if (modern) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        stream.getTracks().forEach((track) => track.stop())
        outcome.camera = 'ok'
        outcome.microphone = 'ok'
      } catch {
        try {
          const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true })
          audioOnly.getTracks().forEach((track) => track.stop())
          outcome.camera = 'fail'
          outcome.microphone = 'ok'
          outcome.detail = '未检测到可用摄像头；本场考试如需抓拍请检查摄像头连接'
        } catch {
          outcome.camera = 'fail'
          outcome.microphone = 'fail'
          outcome.detail = '摄像头与麦克风不可用或未授权；纯客观题考试可继续，抓拍/音视频题将受影响'
        }
      }
    } else {
      outcome.camera = 'fail'
      outcome.microphone = 'fail'
    }

    // 网络延迟（对 API 健康端点计两次采样取小值）
    const started = performance.now()
    try {
      await fetch('/healthz', { cache: 'no-store' })
      const first = performance.now() - started
      const started2 = performance.now()
      await fetch('/healthz', { cache: 'no-store' })
      const second = performance.now() - started2
      outcome.latencyMs = Math.round(Math.min(first, second))
      outcome.network = outcome.latencyMs < 1500 ? 'ok' : 'fail'
    } catch {
      outcome.network = 'fail'
    }

    setResult(outcome)
    setRunning(false)
  }

  const stateTag = (state: CheckState, okText: string, failText: string) =>
    state === 'ok' ? (
      <Tag icon={<CheckCircleFilled />} color="success">{okText}</Tag>
    ) : state === 'fail' ? (
      <Tag icon={<CloseCircleFilled />} color="error">{failText}</Tag>
    ) : (
      <Tag>待检测</Tag>
    )

  return (
    <Modal
      open={open}
      title="考前设备检测"
      width={520}
      footer={
        <>
          {result && (
            <Alert
              type={result.browser === 'ok' && result.network === 'ok' ? 'success' : 'warning'}
              showIcon
              message={
                result.browser === 'ok' && result.network === 'ok'
                  ? '设备满足考试要求，可以进入考试'
                  : '存在未通过项，建议先解决再进入考试'
              }
              style={{ marginBottom: 12, textAlign: 'left' }}
            />
          )}
          <Button onClick={onClose} style={{ marginRight: 8 }}>
            关闭
          </Button>
          <Button type="primary" onClick={run} disabled={running}>
            {running ? '检测中…' : result ? '重新检测' : '开始检测'}
          </Button>
        </>
      }
      onCancel={onClose}
    >
      {running && (
        <div style={{ textAlign: 'center', padding: '18px 0' }}>
          <Spin tip="正在检测摄像头、麦克风与网络，请在浏览器弹窗中允许授权…" />
        </div>
      )}
      {!running && result && (
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="浏览器">{stateTag(result.browser, '支持作答与监考', '版本过旧')}</Descriptions.Item>
          <Descriptions.Item label="摄像头">{stateTag(result.camera, '可用', '不可用')}</Descriptions.Item>
          <Descriptions.Item label="麦克风">{stateTag(result.microphone, '可用', '不可用')}</Descriptions.Item>
          <Descriptions.Item label="网络">
            {stateTag(result.network, `畅通（${result.latencyMs ?? '—'} ms）`, '不稳定')}
          </Descriptions.Item>
        </Descriptions>
      )}
      {!running && !result && (
        <p style={{ color: 'var(--app-text-tertiary)', margin: '6px 0 0' }}>
          检测将请求摄像头与麦克风授权（仅本地检测，不会上传任何画面），并测量与考试服务器的网络延迟。
        </p>
      )}
      {!running && result && result.detail && (
        <Alert type="info" showIcon message={result.detail} style={{ marginTop: 12 }} />
      )}
      {!running && result && (
        <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--app-text-tertiary)' }}>
          当前环境：{navigator.onLine ? '在线' : '离线'} · 分辨率 {window.screen.width}×{window.screen.height}
        </p>
      )}
    </Modal>
  )
}
