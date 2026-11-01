import type { Role } from '../types'
import { navigation, type NavGroup } from './navigation'

/**
 * Which roles may open which page. `org_admin` is the organization superuser and is
 * allowed everywhere (the backend applies the same bypass in its role middleware).
 * Paths without a rule are open to every signed-in user.
 */
const pageRoles: Record<string, Role[]> = {
  '/questions': ['teacher', 'exam_admin'],
  '/papers': ['teacher', 'exam_admin'],
  '/exams': ['exam_admin'],
  '/proctor': ['proctor', 'exam_admin'],
  '/review': ['reviewer', 'exam_admin'],
  '/review/workbench': ['reviewer', 'exam_admin'],
  '/scores': ['exam_admin', 'teacher'],
  '/analytics': ['exam_admin', 'teacher'],
  '/my/exams': ['student'],
  '/my/scores': ['student'],
  '/system/users': ['org_admin'],
  '/system/orgs': ['org_admin'],
  '/system/audit-logs': ['org_admin'],
  '/system/notifications': ['org_admin'],
  '/system/branding': ['org_admin'],
}

export function canAccess(role: Role | undefined, path: string): boolean {
  if (!role) return false
  if (path.startsWith('/attempts/')) return role === 'student'
  if (role === 'org_admin') return true
  const allowed = pageRoles[path]
  if (!allowed) return true
  return allowed.includes(role)
}

export function allowedPaths(role: Role | undefined): string[] {
  return Object.keys(pageRoles).filter((path) => canAccess(role, path))
}

/** Sidebar mirrors the route rules: a role never sees an entry it would be denied on. */
export function visibleNavigation(role: Role | undefined): NavGroup[] {
  return navigation
    .map((group) => ({ ...group, items: group.items.filter((item) => canAccess(role, item.key)) }))
    .filter((group) => group.items.length > 0)
}
