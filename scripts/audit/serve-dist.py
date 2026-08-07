#!/usr/bin/env python3
"""serve-dist.py — serve dist/ the way production does, for the render pass.

Two things a plain `python -m http.server` gets wrong, and both of them would
make the render pass lie:

  * **try_files.** Caddy resolves `/docs` to `/docs/index.html` directly.
    http.server 301s to `/docs/` first, which is a different number of
    navigations and hides trailing-slash defects.
  * **/api.** Every live surface on this site is a client island over
    `/api/...`. Serving dist alone renders the empty-state of every page, so
    "it looks unfinished" would be an artefact of the harness rather than a
    finding. We proxy /api to the real origin so what we screenshot is what a
    visitor gets.

Anonymous only — no cookies are forwarded. Member routes bouncing to /signin is
the correct anonymous behaviour and is itself worth looking at.

Usage: python3 scripts/audit/serve-dist.py <dist_dir> <port>
"""

import http.server
import os
import socketserver
import sys
import urllib.error
import urllib.request

DIST = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "dist")
PORT = int(sys.argv[2] if len(sys.argv) > 2 else 8787)
UPSTREAM = "https://app.loopskill.io"


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=DIST, **kw)

    def log_message(self, *a):  # keep the render pass output readable
        pass

    def do_GET(self):
        if self.path.startswith("/api/") or self.path == "/api":
            return self._proxy()
        resolved = self._try_files(self.path.split("?")[0].split("#")[0])
        if resolved is not None:
            self.path = resolved
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"):
            return self._proxy(method="POST")
        self.send_error(405)

    def _try_files(self, path):
        """Caddy: try_files {path} {path}/index.html {path}.html."""
        rel = path.lstrip("/")
        for candidate in (rel, os.path.join(rel, "index.html"), rel + ".html"):
            full = os.path.join(DIST, candidate)
            if os.path.isfile(full):
                return "/" + candidate.replace(os.sep, "/")
        return None

    def _proxy(self, method="GET"):
        body = None
        if method == "POST":
            length = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(length) if length else b""
        req = urllib.request.Request(UPSTREAM + self.path, data=body, method=method)
        for h in ("Content-Type", "Accept"):
            if self.headers.get(h):
                req.add_header(h, self.headers[h])
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                payload, status, ctype = r.read(), r.status, r.headers.get("Content-Type", "application/json")
        except urllib.error.HTTPError as e:
            payload, status, ctype = e.read(), e.code, e.headers.get("Content-Type", "application/json")
        except Exception as e:  # upstream unreachable — say so rather than hang
            payload, status, ctype = f'{{"error":"proxy: {e}"}}'.encode(), 502, "application/json"
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    with Server(("127.0.0.1", PORT), Handler) as httpd:
        print(f"serving {DIST} on http://127.0.0.1:{PORT} (/api → {UPSTREAM})", flush=True)
        httpd.serve_forever()
