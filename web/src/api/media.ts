import { useAuthStore } from '../stores/auth'
import { apiUpload } from './client'

export type MediaPurpose =
  | 'question_asset'
  | 'answer_media'
  | 'branding'
  | 'proctor_snapshot'
  | 'other'

export interface MediaUploadResult {
  id: string
  filename: string
  mime: string
  size_bytes: number
  url: string
}

/** POST a binary to the media store; the browser owns the multipart boundary. */
export function uploadMedia(file: File, purpose: MediaPurpose): Promise<MediaUploadResult> {
  const form = new FormData()
  form.append('purpose', purpose)
  form.append('file', file)
  return apiUpload<MediaUploadResult>('/media', form)
}

/**
 * URL for <img>/<audio>/<video> tags: they cannot attach an Authorization
 * header, so the access token rides on ?token= exactly like the websocket.
 */
export function mediaContentUrl(mediaId: string): string {
  const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
  const token = useAuthStore.getState().token ?? ''
  return `${base}/api/v1/media/${mediaId}/content?token=${encodeURIComponent(token)}`
}

/** Upload with progress feedback; resolves like uploadMedia when finished. */
export function uploadMediaWithProgress(
  file: File,
  purpose: MediaPurpose,
  onProgress: (percent: number) => void,
): Promise<MediaUploadResult> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('purpose', purpose)
    form.append('file', file)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${(import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')}/api/v1/media`)
    const token = useAuthStore.getState().token
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    }
    xhr.onload = () => {
      try {
        const payload = JSON.parse(xhr.responseText) as { data?: MediaUploadResult; error?: { message?: string } }
        if (xhr.status >= 200 && xhr.status < 300 && payload.data) {
          resolve(payload.data)
        } else {
          reject(new Error(payload.error?.message ?? '上传失败，请稍后重试'))
        }
      } catch {
        reject(new Error('上传失败，请稍后重试'))
      }
    }
    xhr.onerror = () => reject(new Error('网络连接失败，请检查网络后重试'))
    xhr.send(form)
  })
}
