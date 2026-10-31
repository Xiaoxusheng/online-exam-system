import { apiListRequest, apiRequest, toQuery } from './client'
import type { Campus, Class, ListResult, RoleDescriptor, User } from '../types'

export interface UserListParams {
  role?: string
  status?: string
  keyword?: string
  campus_id?: string
  class_id?: string
  page?: number
  page_size?: number
}

export interface UserInput {
  name: string
  username: string
  phone?: string
  email?: string
  password: string
  role: string
  data_scope?: string
  status?: string
  campus_id?: string
  class_id?: string
}

export type UserPatch = Partial<Omit<UserInput, 'username'>>

export function listCampuses(): Promise<Campus[]> {
  return apiRequest<Campus[]>('/campuses')
}

export function createCampus(input: { name: string; address?: string }): Promise<Campus> {
  return apiRequest<Campus>('/campuses', { method: 'POST', body: JSON.stringify(input) })
}

export function listClasses(campusId?: string): Promise<Class[]> {
  return apiRequest<Class[]>(`/classes${toQuery({ campus_id: campusId })}`)
}

export function createClass(input: { name: string; grade?: string; campus_id?: string }): Promise<Class> {
  return apiRequest<Class>('/classes', { method: 'POST', body: JSON.stringify(input) })
}

export function listUsers(params: UserListParams = {}): Promise<ListResult<User>> {
  return apiListRequest<User>(`/users${toQuery(params)}`)
}

export function createUser(input: UserInput): Promise<User> {
  return apiRequest<User>('/users', { method: 'POST', body: JSON.stringify(input) })
}

export function updateUser(id: string, input: UserPatch): Promise<User> {
  return apiRequest<User>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function listRoles(): Promise<RoleDescriptor[]> {
  return apiRequest<RoleDescriptor[]>('/roles')
}
