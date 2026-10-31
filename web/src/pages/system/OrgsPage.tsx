import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Col, Form, Input, Modal, Row, Select, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined } from '@ant-design/icons'
import PageHeader from '../../components/PageHeader'
import QueryError from '../../components/QueryError'
import { createCampus, createClass, listCampuses, listClasses } from '../../api/org'
import { queryKeys } from '../../api/queryKeys'
import { formatDate } from '../../utils/format'
import { errorText } from '../../utils/errors'
import type { Campus, Class } from '../../types'

export default function OrgsPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [campusForm] = Form.useForm<{ name: string; address?: string }>()
  const [classForm] = Form.useForm<{ name: string; grade?: string; campus_id?: string }>()
  const [campusOpen, setCampusOpen] = useState(false)
  const [classOpen, setClassOpen] = useState(false)
  const [campusFilter, setCampusFilter] = useState<string>()

  const campusesQuery = useQuery({ queryKey: queryKeys.campuses, queryFn: listCampuses })
  const classesQuery = useQuery({
    queryKey: queryKeys.classes(campusFilter),
    queryFn: () => listClasses(campusFilter),
  })
  // Campus cards always show the real class count, independent of the table filter.
  const allClassesQuery = useQuery({ queryKey: queryKeys.classes(), queryFn: () => listClasses() })

  const createCampusMutation = useMutation({
    mutationFn: createCampus,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.campuses })
      queryClient.invalidateQueries({ queryKey: ['org', 'users'] })
      setCampusOpen(false)
      campusForm.resetFields()
      message.success('校区已创建')
    },
    onError: (error) => message.error(errorText(error)),
  })

  const createClassMutation = useMutation({
    mutationFn: createClass,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org', 'classes'] })
      queryClient.invalidateQueries({ queryKey: ['org', 'users'] })
      setClassOpen(false)
      classForm.resetFields()
      message.success('班级已创建')
    },
    onError: (error) => message.error(errorText(error)),
  })

  const campusNames = new Map((campusesQuery.data ?? []).map((item) => [item.id, item.name]))
  const campusOptions = (campusesQuery.data ?? []).map((item) => ({ value: item.id, label: item.name }))

  const campusColumns: ColumnsType<Campus> = [
    { title: '校区名称', dataIndex: 'name' },
    { title: '地址', dataIndex: 'address', render: (value: string) => value || <span className="cell-meta">未填写</span> },
    { title: '班级数', key: 'classes', width: 90, render: (_v, record) => countClasses(allClassesQuery.data, record.id) },
    { title: '创建时间', dataIndex: 'created_at', width: 120, render: (value: string) => formatDate(value) },
  ]

  const classColumns: ColumnsType<Class> = [
    { title: '班级', dataIndex: 'name' },
    { title: '年级', dataIndex: 'grade', width: 110, render: (value: string) => value || <span className="cell-meta">未填写</span> },
    {
      title: '所属校区',
      key: 'campus',
      render: (_v, record) => record.campus_name || campusNames.get(record.campus_id ?? '') || <span className="cell-meta">未分配</span>,
    },
    { title: '创建时间', dataIndex: 'created_at', width: 120, render: (value: string) => formatDate(value) },
  ]

  return (
    <div>
      <PageHeader title="组织架构" subtitle="维护校区与班级，支撑考生编排与数据范围。" />

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={10}>
          <Card
            className="panel-card"
            variant="borderless"
            title="校区"
            extra={
              <Button size="small" icon={<PlusOutlined />} onClick={() => setCampusOpen(true)}>
                新建校区
              </Button>
            }
          >
            <QueryError error={campusesQuery.error} onRetry={() => campusesQuery.refetch()} />
            <Table
              rowKey="id"
              size="small"
              loading={campusesQuery.isPending}
              columns={campusColumns}
              dataSource={campusesQuery.data ?? []}
              pagination={false}
            />
          </Card>
        </Col>

        <Col xs={24} xl={14}>
          <Card
            className="panel-card"
            variant="borderless"
            title="班级"
            extra={
              <Button size="small" icon={<PlusOutlined />} onClick={() => setClassOpen(true)}>
                新建班级
              </Button>
            }
          >
            <div className="filter-bar">
              <Select
                allowClear
                placeholder="按校区筛选"
                style={{ width: 200 }}
                value={campusFilter}
                options={campusOptions}
                onChange={(value) => setCampusFilter(value)}
              />
            </div>
            <QueryError error={classesQuery.error} onRetry={() => classesQuery.refetch()} />
            <Table
              rowKey="id"
              size="small"
              loading={classesQuery.isPending}
              columns={classColumns}
              dataSource={classesQuery.data ?? []}
              pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (total) => `共 ${total} 个班级` }}
            />
          </Card>
        </Col>
      </Row>

      <Modal
        open={campusOpen}
        title="新建校区"
        okText="保存"
        cancelText="取消"
        confirmLoading={createCampusMutation.isPending}
        onOk={() => campusForm.submit()}
        onCancel={() => setCampusOpen(false)}
        destroyOnHidden
      >
        <Form form={campusForm} layout="vertical" onFinish={(values) => createCampusMutation.mutate(values)}>
          <Form.Item name="name" label="校区名称" rules={[{ required: true, message: '请填写校区名称' }, { max: 60 }]}>
            <Input placeholder="如：海淀校区" />
          </Form.Item>
          <Form.Item name="address" label="地址" rules={[{ max: 120 }]}>
            <Input placeholder="选填" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={classOpen}
        title="新建班级"
        okText="保存"
        cancelText="取消"
        confirmLoading={createClassMutation.isPending}
        onOk={() => classForm.submit()}
        onCancel={() => setClassOpen(false)}
        destroyOnHidden
      >
        <Form form={classForm} layout="vertical" onFinish={(values) => createClassMutation.mutate(values)}>
          <Form.Item name="name" label="班级名称" rules={[{ required: true, message: '请填写班级名称' }, { max: 60 }]}>
            <Input placeholder="如：高三（2）班" />
          </Form.Item>
          <div className="form-grid">
            <Form.Item name="grade" label="年级" rules={[{ max: 20 }]}>
              <Input placeholder="如：2026" />
            </Form.Item>
            <Form.Item name="campus_id" label="所属校区">
              <Select allowClear placeholder="未分配" options={campusOptions} />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  )
}

function countClasses(classes: Class[] | undefined, campusId: string): number {
  if (!classes) return 0
  return classes.filter((item) => item.campus_id === campusId).length
}
