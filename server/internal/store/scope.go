package store

import "fmt"

// Scope is the caller's data visibility. It mirrors users.data_scope, so a role change
// or a membership change takes effect on the next request instead of the next login.
type Scope struct {
	OrgID     string
	Role      string
	UserID    string
	DataScope string
	CampusID  string
	ClassID   string
}

// peopleFilter limits a people table alias (users) to the caller's scope.
// Every unknown or incomplete scope denies by default instead of widening access.
func (sc Scope) peopleFilter(alias string, argIdx int) (string, []any) {
	if sc.Role == "org_admin" {
		return "", nil
	}
	switch sc.DataScope {
	case "org":
		return "", nil
	case "campus":
		if sc.CampusID == "" {
			return " AND false", nil
		}
		return fmt.Sprintf(" AND %s.campus_id = $%d::uuid", alias, argIdx), []any{sc.CampusID}
	case "class":
		if sc.ClassID == "" {
			return " AND false", nil
		}
		return fmt.Sprintf(" AND %s.class_id = $%d::uuid", alias, argIdx), []any{sc.ClassID}
	case "self":
		return fmt.Sprintf(" AND %s.id = $%d::uuid", alias, argIdx), []any{sc.UserID}
	default:
		return " AND false", nil
	}
}

// bankVisibility limits content libraries: personal banks belong to their creator and
// campus banks to the creator's campus. Organization banks stay shared for everyone.
func (sc Scope) bankVisibility(alias string, argIdx int) (string, []any) {
	if sc.Role == "org_admin" {
		return "", nil
	}
	predicate := fmt.Sprintf(" AND (%s.scope = 'org'", alias)
	args := make([]any, 0, 2)
	if sc.UserID != "" {
		predicate += fmt.Sprintf(" OR (%s.scope = 'personal' AND %s.owner_id = $%d::uuid)", alias, alias, argIdx)
		args = append(args, sc.UserID)
		argIdx++
	}
	if sc.CampusID != "" {
		predicate += fmt.Sprintf(
			" OR (%s.scope = 'campus' AND EXISTS (SELECT 1 FROM users bo WHERE bo.id = %s.owner_id AND bo.campus_id = $%d::uuid))",
			alias, alias, argIdx,
		)
		args = append(args, sc.CampusID)
	}
	if len(args) == 0 {
		predicate += " OR false"
	}
	return predicate + ")", args
}
