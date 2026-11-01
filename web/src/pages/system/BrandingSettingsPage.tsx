import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Form, Input, Upload } from 'antd'
import { DeleteOutlined, PictureOutlined } from '@ant-design/icons'
import PageHeader from '../../components/PageHeader'
import QueryError from '../../components/QueryError'
import { getBranding, updateBranding } from '../../api/system'
import { uploadMedia } from '../../api/media'
import { queryKeys } from '../../api/queryKeys'
import { errorText } from '../../utils/errors'

interface BrandingForm {
  name: string
  slogan?: string
}

/** Branding settings (A-05): org display name, login slogan and logo. */
export default function BrandingSettingsPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<BrandingForm>()
  const [logoId, setLogoId] = useState<string>('')

  const brandingQuery = useQuery({ queryKey: queryKeys.branding, queryFn: getBranding })
  const branding = brandingQuery.data

  useEffect(() => {
    if (branding) {
      form.setFieldsValue({ name: branding.name, slogan: branding.slogan })
      setLogoId(branding.logo_media_id || '')
    }
  }, [branding, form])

  const saveMutation = useMutation({
    mutationFn: (values: BrandingForm) =>
      updateBranding({ name: values.name, slogan: values.slogan ?? '', logo_media_id: logoId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.branding })
      message.success('品牌信息已保存，登录页与侧栏即刻生效')
    },
    onError: (error) => message.error(errorText(error)),
  })

  return (
    <div>
      <PageHeader title="品牌设置" subtitle="机构名称、登录页标语与 Logo，作用于登录页、管理端侧栏与考生端。" />
      <QueryError error={brandingQuery.error} onRetry={() => brandingQuery.refetch()} />

      <Card className="panel-card" variant="borderless" style={{ maxWidth: 640 }} loading={brandingQuery.isPending}>
        <Form<BrandingForm> form={form} layout="vertical" onFinish={(values) => saveMutation.mutate(values)}>
          <Form.Item
            name="name"
            label="机构名称"
            rules={[
              { required: true, message: '请填写机构名称' },
              { max: 60, message: '机构名称不超过 60 字' },
            ]}
          >
            <Input placeholder="例如：启明教育培训学校" />
          </Form.Item>
          <Form.Item name="slogan" label="登录页标语" rules={[{ max: 80, message: '标语不超过 80 字' }]}>
            <Input placeholder="例如：稳定 · 可信 · 可追溯" />
          </Form.Item>
          <Form.Item label="机构 Logo" tooltip="建议 512×512 以上方形图；支持 png / jpg / webp / gif">
            {logoId ? (
              <div className="branding-logo-preview">
                <img src={`/api/v1/media/${logoId}/content`} alt="机构 Logo" />
                <Button danger icon={<DeleteOutlined />} onClick={() => setLogoId('')}>
                  移除 Logo
                </Button>
              </div>
            ) : (
              <Upload
                accept="image/png,image/jpeg,image/webp,image/gif"
                showUploadList={false}
                customRequest={({ file, onSuccess, onError }) => {
                  uploadMedia(file as File, 'branding')
                    .then((result) => {
                      setLogoId(result.id)
                      onSuccess?.(result)
                    })
                    .catch((error) => {
                      message.error(errorText(error))
                      onError?.(error as Error)
                    })
                }}
              >
                <Button icon={<PictureOutlined />}>上传 Logo</Button>
              </Upload>
            )}
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saveMutation.isPending}>
            保存品牌设置
          </Button>
        </Form>
      </Card>
    </div>
  )
}
