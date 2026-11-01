import { Button, Result, Space } from 'antd'
import { useNavigate } from 'react-router-dom'

export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <Result
      status="404"
      title="页面走丢了"
      subTitle="你访问的页面可能已被移动或删除，返回工作台继续操作。"
      extra={
        <Space>
          <Button type="primary" onClick={() => navigate('/')}>
            返回工作台
          </Button>
          <Button onClick={() => navigate(-1)}>返回上一页</Button>
        </Space>
      }
    />
  )
}
