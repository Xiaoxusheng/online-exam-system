import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Flex, Form, Input, Modal, Select, Table, Tabs, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import PageHeader from '../../components/PageHeader'
import QueryError from '../../components/QueryError'
import { createUser, listCampuses, listClasses, listRoles, listUsers, updateUser } from '../../api/org'
import type { UserInput, UserListParams, UserPatch } from '../../api/org'
import { queryKeys } from '../../api/queryKeys'
import { dataScopeLabel, roleLabel } from '../../utils/labels'
import { formatDateTime } from '../../utils/format'
import { errorText } from '../../utils/errors'
import type { Role, User } from '../../types'

interface UserFilter extends UserListParams {
  page?: number
  page_size?: number
}

const statusOptions = [
  { value: 'active', label: '启用' },
  { value: 'disabled', label: '停用' },
]

const scopeOptions = ['org', 'campus', 'class', 'self'].map((value) => ({ value, label: dataScopeLabel(value) }))

/** 角色用不同色系区分，扫表时不必逐字读文字。 */
const roleTone: Record<string, string> = {
  org_admin: 'purple',
  exam_admin: 'blue',
  teacher: 'cyan',
  reviewer: 'geekblue',
  proctor: 'gold',
  student: 'default',
}

function UserFormModal({
  open,
  editing,
  roleOptions,
  campusOptions,
  classOptions,
  onCancel,
  onSubmitted,
}: {
  open: boolean
  editing: User | null
  roleOptions: { value: string; label: string }[]
  campusOptions: { value: string; label: string }[]
  classOptions: { value: string; label: string }[]
  onCancel: () => void
  onSubmitted: () => void
}) {
  const { message } = App.useApp()
  const [form] = Form.useForm<UserInput & { password?: string }>()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (values: UserInput & { password?: string }) =>
      editing ? updateUser(editing.id, values as UserPatch) : createUser(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org', 'users'] })
      message.success(editing ? '账号已更新' : '账号已创建')
      onSubmitted()
    },
    onError: (error) => message.error(errorText(error)),
  })

  async function handleSubmit() {
    let values: UserInput & { password?: string }
    try {
      values = await form.validateFields()
    } catch {
      // antd renders the field-level errors; an unhandled rejection would be noise.
      return
    }
    mutation.mutate(values)
  }

  return (
    <Modal
      open={open}
      title={editing ? `编辑账号 · ${editing.name}` : '新建账号'}
      okText="保存"
      cancelText="取消"
      confirmLoading={mutation.isPending}
      onOk={handleSubmit}
      onCancel={onCancel}
      destroyOnHidden
      width={560}
    >
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={
          editing
            ? {
                name: editing.name,
                username: editing.username,
                phone: editing.phone,
                email: editing.email,
                role: editing.role,
                data_scope: editing.data_scope,
                status: editing.status,
                campus_id: editing.campus_id,
                class_id: editing.class_id,
              }
            : { role: 'student', data_scope: 'self', status: 'active' }
        }
      >
        <div className="form-grid">
          <Form.Item
            name="name"
            label="姓名"
            rules={[{ required: true, message: '请填写姓名' }, { max: 40, message: '姓名不超过 40 个字符' }]}
          >
            <Input placeholder="如：张三" />
          </Form.Item>
          <Form.Item
            name="username"
            label="用户名"
            rules={editing ? [] : [{ required: true, message: '请填写登录用户名' }, { min: 3, message: '至少 3 个字符' }]}
          >
            <Input placeholder="登录账号" disabled={Boolean(editing)} />
          </Form.Item>
        </div>

        <div className="form-grid">
          <Form.Item name="phone" label="手机号" rules={[{ max: 20, message: '手机号过长' }]}>
            <Input placeholder="用于登录与通知" />
          </Form.Item>
          <Form.Item name="email" label="邮箱" rules={[{ max: 120, message: '邮箱过长' }]}>
            <Input placeholder="选填" />
          </Form.Item>
        </div>

        {!editing && (
          <Form.Item
            name="password"
            label="初始密码"
            rules={[
              { required: true, message: '请设置初始密码' },
              { min: 8, message: '密码至少 8 位' },
              { max: 72, message: '密码不超过 72 位' },
            ]}
          >
            <Input.Password placeholder="8-72 位，建议字母数字混合" />
          </Form.Item>
        )}

        <div className="form-grid">
          <Form.Item name="role" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
            <Select options={roleOptions} />
          </Form.Item>
          <Form.Item name="data_scope" label="数据范围" rules={[{ required: true, message: '请选择数据范围' }]}>
            <Select options={scopeOptions} />
          </Form.Item>
        </div>

        <div className="form-grid">
          <Form.Item name="campus_id" label="所属校区" >
            <Select allowClear placeholder="未分配" options={campusOptions} />
          </Form.Item>
          <Form.Item name="class_id" label="所属班级" >
            <Select allowClear placeholder="未分配" options={classOptions} />
          </Form.Item>
        </div>

        {editing && (
          <Form.Item name="password" label="重置密码" extra="留空表示不修改密码">
            <Input.Password placeholder="如需重置请输入新密码" />
          </Form.Item>
        )}

        {editing && (
          <Form.Item name="status" label="账号状态">
            <Select options={statusOptions} />
          </Form.Item>
        )}
      </Form>
    </Modal>
  )
}

export default function UsersPage() {
  const [filters, setFilters] = useState<UserFilter>({ page: 1, page_size: 20 })
  const [draft, setDraft] = useState<Omit<UserFilter, 'page' | 'page_size'>>({})
  const [editing, setEditing] = useState<User | null>(null)
  const [creating, setCreating] = useState(false)

  const rolesQuery = useQuery({ queryKey: queryKeys.roles, queryFn: listRoles })
  const campusesQuery = useQuery({ queryKey: queryKeys.campuses, queryFn: listCampuses })
  const classesQuery = useQuery({ queryKey: queryKeys.classes(), queryFn: () => listClasses() })
  const usersQuery = useQuery({ queryKey: queryKeys.users(filters), queryFn: () => listUsers(filters) })

  const roleOptions = (rolesQuery.data ?? []).map((role) => ({ value: role.code, label: role.name }))
  const campusOptions = (campusesQuery.data ?? []).map((campus) => ({ value: campus.id, label: campus.name }))
  const classOptions = (classesQuery.data ?? []).map((item) => ({ value: item.id, label: item.name }))
  const campusNames = new Map((campusesQuery.data ?? []).map((campus) => [campus.id, campus.name]))
  const classNames = new Map((classesQuery.data ?? []).map((item) => [item.id, item.name]))

  const columns: ColumnsType<User> = [
    {
      title: '姓名',
      dataIndex: 'name',
      render: (_value, record) => (
        <div className="cell-stack">
          <span className="cell-title">{record.name}</span>
          <span className="cell-meta">{record.username}</span>
        </div>
      ),
    },
    {
      title: '角色',
      dataIndex: 'role',
      width: 120,
      render: (value: Role) => <Tag color={roleTone[value] ?? 'default'}>{roleLabel(value)}</Tag>,
    },
    {
      title: '数据范围',
      dataIndex: 'data_scope',
      width: 110,
      render: (value: string) => dataScopeLabel(value),
    },
    {
      title: '归属',
      key: 'membership',
      render: (_value, record) => {
        const campus = record.campus_id ? campusNames.get(record.campus_id) : undefined
        const klass = record.class_id ? classNames.get(record.class_id) : undefined
        if (!campus && !klass) return <span className="cell-meta">未分配</span>
        return (
          <div className="cell-stack">
            <span className="cell-title">{campus ?? '—'}</span>
            <span className="cell-meta">{klass ?? '无班级'}</span>
          </div>
        )
      },
    },
    {
      title: '联系方式',
      key: 'contact',
      width: 170,
      render: (_value, record) => (
        <div className="cell-stack">
          <span className="cell-title">{record.phone || '—'}</span>
          <span className="cell-meta">{record.email || '无邮箱'}</span>
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 96,
      render: (value: string) => (value === 'active' ? <Tag color="green">启用</Tag> : <Tag>已停用</Tag>),
    },
    {
      title: '最近登录',
      dataIndex: 'last_login_at',
      width: 160,
      render: (value?: string) => <span className="cell-meta">{formatDateTime(value)}</span>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 80,
      fixed: 'right',
      render: (_value, record) => (
        <Button type="link" size="small" onClick={() => setEditing(record)}>
          编辑
        </Button>
      ),
    },
  ]

  const pagination = usersQuery.data?.pagination

  return (
    <div>
      <PageHeader
        title="账号与角色"
        subtitle="统一账号体系：机构管理员、考务、命题、阅卷、监考与考生。"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
            新建账号
          </Button>
        }
      />

      <Card className="panel-card" variant="borderless">
        <Tabs
          items={[
            {
              key: 'users',
              label: '用户管理',
              children: (
                <>
                  <Flex className="filter-bar" gap={12} wrap align="flex-end">
                    <Select
                      allowClear
                      placeholder="角色"
                      style={{ width: 140 }}
                      value={draft.role}
                      options={roleOptions}
                      onChange={(value) => setDraft({ ...draft, role: value })}
                    />
                    <Select
                      allowClear
                      placeholder="状态"
                      style={{ width: 120 }}
                      value={draft.status}
                      options={statusOptions}
                      onChange={(value) => setDraft({ ...draft, status: value })}
                    />
                    <Select
                      allowClear
                      placeholder="校区"
                      style={{ width: 160 }}
                      value={draft.campus_id}
                      options={campusOptions}
                      onChange={(value) => setDraft({ ...draft, campus_id: value })}
                    />
                    <Select
                      allowClear
                      placeholder="班级"
                      style={{ width: 160 }}
                      value={draft.class_id}
                      options={classOptions}
                      onChange={(value) => setDraft({ ...draft, class_id: value })}
                    />
                    <Input
                      allowClear
                      placeholder="姓名 / 用户名 / 手机号"
                      style={{ width: 220 }}
                      value={draft.keyword}
                      onChange={(event) => setDraft({ ...draft, keyword: event.target.value })}
                      onPressEnter={() => setFilters({ ...draft, page: 1, page_size: pagination?.page_size ?? 20 })}
                    />
                    <Button
                      type="primary"
                      icon={<SearchOutlined />}
                      onClick={() => setFilters({ ...draft, page: 1, page_size: pagination?.page_size ?? 20 })}
                    >
                      查询
                    </Button>
                    <Button
                      icon={<ReloadOutlined />}
                      onClick={() => {
                        setDraft({})
                        setFilters({ page: 1, page_size: 20 })
                      }}
                    >
                      重置
                    </Button>
                  </Flex>

                  <QueryError
                    error={usersQuery.error}
                    onRetry={() => usersQuery.refetch()}
                    emptyHint="若刚创建账号，请稍后重试。"
                  />

                  <Table
                    rowKey="id"
                    size="middle"
                    loading={usersQuery.isPending}
                    columns={columns}
                    dataSource={usersQuery.data?.items ?? []}
                    scroll={{ x: 1080 }}
                    pagination={{
                      current: pagination?.page ?? 1,
                      pageSize: pagination?.page_size ?? 20,
                      total: pagination?.total ?? 0,
                      showSizeChanger: true,
                      showTotal: (total) => `共 ${total} 个账号`,
                      onChange: (page, pageSize) => setFilters({ ...draft, page, page_size: pageSize }),
                    }}
                    locale={{ emptyText: usersQuery.isError ? ' ' : '没有符合条件的账号' }}
                  />
                </>
              ),
            },
            {
              key: 'roles',
              label: '角色与数据范围',
              children: (
                <Table
                  rowKey="code"
                  size="middle"
                  loading={rolesQuery.isPending}
                  columns={[
                    { title: '角色', dataIndex: 'name', width: 140 },
                    { title: '标识', dataIndex: 'code', width: 140, render: (value: string) => <code>{value}</code> },
                    { title: '默认数据范围', dataIndex: 'data_scope', width: 130, render: (value: string) => dataScopeLabel(value) },
                    { title: '职责', dataIndex: 'description' },
                  ]}
                  dataSource={rolesQuery.data ?? []}
                  pagination={false}
                />
              ),
            },
          ]}
        />
      </Card>

      <UserFormModal
        open={creating || Boolean(editing)}
        editing={editing}
        roleOptions={roleOptions}
        campusOptions={campusOptions}
        classOptions={classOptions}
        onCancel={() => {
          setCreating(false)
          setEditing(null)
        }}
        onSubmitted={() => {
          setCreating(false)
          setEditing(null)
        }}
      />
    </div>
  )
}
