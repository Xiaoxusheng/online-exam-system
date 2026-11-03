import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Col, Flex, Form, Input, Modal, Pagination, Row, Select, Skeleton, Tabs, Tag } from 'antd'
import {
  ApartmentOutlined,
  PhoneOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import PageHeader from '../../components/PageHeader'
import QueryError from '../../components/QueryError'
import EmptyState from '../../components/EmptyState'
import { createUser, listCampuses, listClasses, listRoles, listUsers, updateUser } from '../../api/org'
import type { UserInput, UserListParams, UserPatch } from '../../api/org'
import { queryKeys } from '../../api/queryKeys'
import { dataScopeLabel, roleLabel } from '../../utils/labels'
import { formatDateTime } from '../../utils/format'
import { errorText } from '../../utils/errors'
import type { RoleDescriptor, User } from '../../types'

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
  const usersQuery = useQuery({
    queryKey: queryKeys.users(filters),
    queryFn: () => listUsers(filters),
    placeholderData: keepPreviousData,
  })

  const roleOptions = (rolesQuery.data ?? []).map((role) => ({ value: role.code, label: role.name }))
  const campusOptions = (campusesQuery.data ?? []).map((campus) => ({ value: campus.id, label: campus.name }))
  const classOptions = (classesQuery.data ?? []).map((item) => ({ value: item.id, label: item.name }))
  const campusNames = new Map((campusesQuery.data ?? []).map((campus) => [campus.id, campus.name]))
  const classNames = new Map((classesQuery.data ?? []).map((item) => [item.id, item.name]))

  const users = usersQuery.data?.items ?? []
  const roles = rolesQuery.data ?? []
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

                  {usersQuery.isFetching && users.length === 0 ? (
                    <Row gutter={[12, 12]}>
                      {[0, 1, 2].map((index) => (
                        <Col key={index} xs={24} sm={12} xl={8}>
                          <Card className="panel-card room-card" variant="borderless">
                            <Skeleton active title paragraph={{ rows: 2 }} />
                          </Card>
                        </Col>
                      ))}
                    </Row>
                  ) : users.length === 0 ? (
                    <Card className="panel-card" variant="borderless">
                      <EmptyState
                        icon={<ApartmentOutlined />}
                        title="没有符合条件的账号"
                        description="调整筛选条件，或点击右上角「新建账号」。"
                      />
                    </Card>
                  ) : (
                    <>
                      <Row gutter={[12, 12]}>
                        {users.map((user) => {
                          const campus = user.campus_id ? campusNames.get(user.campus_id) : undefined
                          const klass = user.class_id ? classNames.get(user.class_id) : undefined
                          return (
                            <Col key={user.id} xs={24} sm={12} xl={8}>
                              <Card
                                className="panel-card room-card is-interactive"
                                variant="borderless"
                                onClick={() => setEditing(user)}
                              >
                                <div className="room-card-head">
                                  <div className="cell-stack">
                                    <span className="room-card-title">{user.name}</span>
                                    <span className="cell-meta">@{user.username}</span>
                                  </div>
                                  <Tag color={roleTone[user.role] ?? 'default'}>{roleLabel(user.role)}</Tag>
                                </div>
                                <div className="room-card-schedule">
                                  <ApartmentOutlined />
                                  <span>{campus ?? '未分配校区'}{klass ? ` · ${klass}` : ''}</span>
                                </div>
                                <div className="room-card-schedule">
                                  <PhoneOutlined />
                                  <span>{user.phone || '未留手机号'}{user.email ? ` · ${user.email}` : ''}</span>
                                </div>
                                <div className="room-card-foot">
                                  <span className="room-chip">{dataScopeLabel(user.data_scope)}</span>
                                  {user.status === 'active' ? <Tag color="green">启用</Tag> : <Tag>已停用</Tag>}
                                  <span className="cell-meta">登录 {formatDateTime(user.last_login_at)}</span>
                                  <RightOutlined className="room-card-enter" />
                                </div>
                              </Card>
                            </Col>
                          )
                        })}
                      </Row>
                      <Flex justify="flex-end" style={{ marginTop: 16 }}>
                        <Pagination
                          current={pagination?.page ?? 1}
                          pageSize={pagination?.page_size ?? 20}
                          total={pagination?.total ?? 0}
                          showSizeChanger
                          showTotal={(total) => `共 ${total} 个账号`}
                          onChange={(page, pageSize) => setFilters({ ...draft, page, page_size: pageSize })}
                        />
                      </Flex>
                    </>
                  )}
                </>
              ),
            },
            {
              key: 'roles',
              label: '角色与数据范围',
              children: (
                <Row gutter={[12, 12]}>
                  {roles.map((role: RoleDescriptor) => (
                    <Col key={role.code} xs={24} sm={12} xl={8}>
                      <Card className="panel-card room-card" variant="borderless">
                        <div className="room-card-head">
                          <span className="room-card-title">{role.name}</span>
                          <span className="room-chip">{role.code}</span>
                        </div>
                        <div className="room-card-schedule">
                          <ApartmentOutlined />
                          <span>默认数据范围：{dataScopeLabel(role.data_scope)}</span>
                        </div>
                        <div className="room-card-paper">
                          <span title={role.description}>{role.description}</span>
                        </div>
                      </Card>
                    </Col>
                  ))}
                </Row>
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
