import { useEffect, useMemo, useRef, useState } from 'react'
import { App, Button, Progress, Space, Tag } from 'antd'
import { AudioOutlined, CheckOutlined, PlayCircleOutlined, VideoCameraOutlined } from '@ant-design/icons'
import { uploadMediaWithProgress } from '../../api/media'
import { errorText } from '../../utils/errors'

interface MediaAnswerProps {
  mode: 'audio' | 'video'
  prepareSeconds: number
  minSeconds: number
  maxSeconds: number
  retakeLimit: number
  disabled?: boolean
  /** Persisted state: media id + duration, edited in place. */
  value?: { media_id?: string; duration_ms?: number }
  onChange: (value: { media_id?: string; duration_ms?: number }) => void
}

type Phase = 'idle' | 'ready' | 'recording' | 'reviewing' | 'uploading' | 'done'

/**
 * Candidate audio/video answer: prepare → record (hard stop at max) → review
 * → upload to the media store. Retakes are bounded by the question config.
 */
export default function MediaAnswer({
  mode,
  prepareSeconds,
  minSeconds,
  maxSeconds,
  retakeLimit,
  disabled,
  value,
  onChange,
}: MediaAnswerProps) {
  const { message } = App.useApp()
  const [phase, setPhase] = useState<Phase>(value?.media_id ? 'done' : 'idle')
  const [elapsed, setElapsed] = useState(0)
  const [uploadPercent, setUploadPercent] = useState(0)
  const [retakes, setRetakes] = useState(0)
  const [localUrl, setLocalUrl] = useState<string>('')
  const [mediaError, setMediaError] = useState('')

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const tickRef = useRef<number>(0)
  const blobRef = useRef<Blob | null>(null)

  const videoMode = mode === 'video'

  const cleanup = () => {
    window.clearInterval(tickRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    recorderRef.current = null
  }

  useEffect(() => cleanup, [])

  const previewUrl = useMemo(() => {
    if (phase === 'done' && value?.media_id) return `/api/v1/media/${value.media_id}/content`
    if (phase === 'reviewing' && localUrl) return localUrl
    return ''
  }, [phase, value?.media_id, localUrl])

  async function openStream(): Promise<MediaStream> {
    const constraints: MediaStreamConstraints = videoMode
      ? { audio: true, video: { width: 640, height: 480 } }
      : { audio: true }
    return navigator.mediaDevices.getUserMedia(constraints)
  }

  async function startRecording() {
    setMediaError('')
    try {
      const stream = await openStream()
      streamRef.current = stream
      const mimeCandidates = videoMode
        ? ['video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4']
        : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
      const mimeType = mimeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? ''
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        blobRef.current = new Blob(chunksRef.current, { type: recorder.mimeType })
        setLocalUrl(URL.createObjectURL(blobRef.current))
        setPhase('reviewing')
        cleanup()
      }
      recorderRef.current = recorder
      recorder.start(1000)
      setElapsed(0)
      setPhase('recording')
      tickRef.current = window.setInterval(() => {
        setElapsed((seconds) => {
          if (seconds + 1 >= maxSeconds) {
            stopRecording()
            return maxSeconds
          }
          return seconds + 1
        })
      }, 1000)
    } catch (error) {
      setMediaError('无法访问摄像头/麦克风，请检查浏览器权限后重试')
      void error
    }
  }

  function stopRecording() {
    window.clearInterval(tickRef.current)
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
  }

  async function confirmAndUpload() {
    if (!blobRef.current) return
    if (elapsed > 0 && elapsed < minSeconds) {
      message.warning(`作答时长不足 ${minSeconds} 秒，请重新录制`)
      return
    }
    setPhase('uploading')
    setUploadPercent(0)
    try {
      const extension = blobRef.current.type.includes('mp4') ? 'mp4' : 'webm'
      const file = new File([blobRef.current], `answer-${Date.now()}.${extension}`, { type: blobRef.current.type })
      const uploaded = await uploadMediaWithProgress(file, 'answer_media', setUploadPercent)
      onChange({ media_id: uploaded.id, duration_ms: elapsed * 1000 })
      setPhase('done')
      message.success('音视频作答已上传')
    } catch (error) {
      message.error(`上传失败：${errorText(error)}`)
      setPhase('reviewing')
    }
  }

  function discardTake() {
    if (retakes >= retakeLimit) {
      message.warning(`重录次数已用完（上限 ${retakeLimit} 次）`)
      return
    }
    setRetakes((count) => count + 1)
    blobRef.current = null
    setLocalUrl('')
    setPhase('idle')
  }

  const phaseLabels: Record<Phase, string> = {
    idle: videoMode ? '准备录制视频' : '准备录制音频',
    ready: '准备中',
    recording: videoMode ? '录制中' : '录音中',
    reviewing: '试听/确认',
    uploading: '上传中',
    done: '已提交',
  }

  return (
    <div className="media-answer">
      <Space wrap className="media-answer-status">
        <Tag className="soft-tag">{phaseLabels[phase]}</Tag>
        {(phase === 'recording' || phase === 'reviewing') && (
          <Tag color={phase === 'recording' ? 'red' : 'blue'}>
            {formatSeconds(phase === 'recording' ? elapsed : 0)} / 上限 {formatSeconds(maxSeconds)}
          </Tag>
        )}
        <span className="cell-meta">重录 {retakes}/{retakeLimit} 次</span>
      </Space>

      {mediaError && <div className="cell-meta" style={{ color: 'var(--app-danger, #d64545)' }}>{mediaError}</div>}

      {phase === 'recording' && videoMode && (
        <div className="media-answer-video">
          <VideoCameraOutlined spin style={{ fontSize: 28 }} />
          <span>正在录制，请正视摄像头作答</span>
        </div>
      )}
      {phase === 'recording' && !videoMode && (
        <div className="media-answer-video">
          <AudioOutlined spin style={{ fontSize: 28 }} />
          <span>正在录音，请清晰作答</span>
        </div>
      )}

      {(phase === 'reviewing' || phase === 'done') && previewUrl && (
        <div className="media-answer-preview">
          {videoMode ? (
            <video key={previewUrl} src={previewUrl} controls preload="metadata" />
          ) : (
            <audio key={previewUrl} src={previewUrl} controls preload="metadata" />
          )}
        </div>
      )}

      {phase === 'uploading' && <Progress percent={uploadPercent} size="small" />}

      <Space className="media-answer-actions" wrap>
        {phase === 'idle' && (
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            disabled={disabled}
            onClick={() => {
              setPhase('ready')
              window.setTimeout(() => void startRecording(), Math.min(prepareSeconds, 3) * 1000)
              message.info(`请准备，${Math.min(prepareSeconds, 3)} 秒后开始录制`)
            }}
          >
            开始{videoMode ? '录制' : '录音'}
          </Button>
        )}
        {phase === 'recording' && (
          <Button type="primary" danger icon={<CheckOutlined />} onClick={stopRecording}>
            结束录制
          </Button>
        )}
        {phase === 'reviewing' && (
          <>
            <Button type="primary" icon={<CheckOutlined />} onClick={() => void confirmAndUpload()}>
              确认并上传
            </Button>
            <Button disabled={retakes >= retakeLimit} onClick={discardTake}>
              重新录制
            </Button>
          </>
        )}
      </Space>
    </div>
  )
}

function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
