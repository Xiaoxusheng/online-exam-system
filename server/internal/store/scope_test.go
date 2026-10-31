package store

import (
	"strings"
	"testing"
)

func TestPeopleFilter(t *testing.T) {
	cases := []struct {
		name    string
		scope   Scope
		want    string
		wantArg any
	}{
		{name: "org admin is unrestricted", scope: Scope{Role: "org_admin", DataScope: "self"}, want: ""},
		{name: "org scope is unrestricted", scope: Scope{Role: "teacher", DataScope: "org"}, want: ""},
		{
			name:    "campus scope filters by campus",
			scope:   Scope{Role: "teacher", DataScope: "campus", CampusID: "c-1"},
			want:    " AND users.campus_id = $2::uuid",
			wantArg: "c-1",
		},
		{name: "campus scope without campus denies", scope: Scope{Role: "teacher", DataScope: "campus"}, want: " AND false"},
		{
			name:    "class scope filters by class",
			scope:   Scope{Role: "teacher", DataScope: "class", ClassID: "k-1"},
			want:    " AND users.class_id = $2::uuid",
			wantArg: "k-1",
		},
		{
			name:    "self scope filters by id",
			scope:   Scope{Role: "student", DataScope: "self", UserID: "u-1"},
			want:    " AND users.id = $2::uuid",
			wantArg: "u-1",
		},
		{name: "unknown scope denies by default", scope: Scope{Role: "teacher", DataScope: "everything"}, want: " AND false"},
		{name: "empty scope denies by default", scope: Scope{Role: "teacher"}, want: " AND false"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			sql, args := tc.scope.peopleFilter("users", 2)
			if sql != tc.want {
				t.Fatalf("sql = %q, want %q", sql, tc.want)
			}
			if tc.wantArg != nil {
				if len(args) != 1 || args[0] != tc.wantArg {
					t.Fatalf("args = %v, want [%v]", args, tc.wantArg)
				}
			} else if len(args) != 0 {
				t.Fatalf("args = %v, want none", args)
			}
		})
	}
}

func TestBankVisibility(t *testing.T) {
	sql, args := (Scope{Role: "org_admin"}).bankVisibility("b", 2)
	if sql != "" || len(args) != 0 {
		t.Fatalf("org admin should see every bank, got %q %v", sql, args)
	}

	sql, args = (Scope{Role: "teacher", UserID: "u-1", CampusID: "c-1"}).bankVisibility("b", 2)
	for _, fragment := range []string{"b.scope = 'org'", "b.scope = 'personal'", "b.owner_id = $2::uuid", "b.scope = 'campus'", "$3::uuid"} {
		if !strings.Contains(sql, fragment) {
			t.Fatalf("predicate %q is missing %q", sql, fragment)
		}
	}
	if len(args) != 2 {
		t.Fatalf("args = %v, want two scope args", args)
	}

	// A user without campus keeps org + personal banks but must not see campus banks.
	sql, args = (Scope{Role: "teacher", UserID: "u-1"}).bankVisibility("b", 2)
	if strings.Contains(sql, "'campus'") {
		t.Fatalf("campus banks must stay hidden without a campus: %q", sql)
	}
	if len(args) != 1 {
		t.Fatalf("args = %v, want one", args)
	}
}
