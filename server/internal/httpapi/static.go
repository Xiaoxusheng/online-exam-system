package httpapi

import (
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// mountStatic serves the built SPA from webDir and falls back to index.html so client
// routes survive a hard refresh. API and health routes are registered separately.
func (a *API) mountStatic(r chiRouter, webDir string) {
	root, err := filepath.Abs(webDir)
	if err != nil {
		a.log.Error("invalid web dir", "dir", webDir, "error", err)
		return
	}
	index := filepath.Join(root, "index.html")
	if _, err := os.Stat(index); err != nil {
		a.log.Warn("web dir has no index.html, static hosting disabled", "dir", root)
		return
	}
	fileServer := http.FileServer(http.Dir(root))
	r.Get("/*", func(w http.ResponseWriter, req *http.Request) {
		clean := path.Clean("/" + req.URL.Path)
		if strings.HasPrefix(clean, "/api/") || clean == "/healthz" || clean == "/readyz" {
			http.NotFound(w, req)
			return
		}
		target := filepath.Join(root, filepath.FromSlash(clean))
		if info, statErr := os.Stat(target); statErr == nil && !info.IsDir() {
			if strings.HasPrefix(clean, "/assets/") {
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			}
			fileServer.ServeHTTP(w, req)
			return
		}
		w.Header().Set("Cache-Control", "no-cache")
		http.ServeFile(w, req, index)
	})
}
