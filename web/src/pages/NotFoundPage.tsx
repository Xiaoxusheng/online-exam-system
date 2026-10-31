import { Button } from 'antd'
import { ArrowLeftOutlined, HomeOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'

export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div className="not-found">
      <div className="not-found-code">404</div>
      <h1>页面走丢了</h1>
      <p>你访问的页面可能已被移动或删除，返回工作台继续操作。</p>
      <div className="not-found-actions">
        <Button type="primary" icon={<HomeOutlined />} onClick={() => navigate('/')}>
          返回工作台
        </Button>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
          返回上一页
        </Button>
      </div>
    </div>
  )
}
