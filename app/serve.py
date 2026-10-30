"""Regula API — standard library only, no install step, no build step."""
from __future__ import annotations

import json
import mimetypes
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, unquote

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from regula import pipeline, store  # noqa: E402

WEB = ROOT.parent / "web"
LOCK = threading.Lock()
STATE = store.load_or_build(reset="--reset" in sys.argv)
_, _, DOCS, PRIORS = store.load_seed()

MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
}


class Handler(BaseHTTPRequestHandler):
    server_version = "Regula/1.0"

    def log_message(self, fmt, *args):  # quiet, useful lines only
        if "/api/" in (args[0] if args else ""):
            sys.stderr.write("  %s\n" % (fmt % args))

    # ---------- helpers ----------
    def _send(self, code: int, body: bytes, ctype: str, extra: dict | None = None) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, code: int, payload) -> None:
        self._send(code, json.dumps(payload, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

    def _body(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if not length:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            return {}

    def _state(self) -> None:
        with LOCK:
            self._json(200, store.serialize(STATE))

    # ---------- routes ----------
    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        path = unquote(urlparse(self.path).path)
        if path in ("/api/state", "/api/state/"):
            return self._state()
        if path == "/api/health":
            return self._json(200, {"ok": True, "sources": len(STATE["sources"]), "audit": len(STATE["audit"])})
        if path.startswith("/api/export/"):
            sid = path.rsplit("/", 1)[-1].replace(".md", "")
            try:
                md = store.source_report(STATE, sid)
            except KeyError:
                return self._json(404, {"error": "source not found"})
            name = f"impact-assessment-{sid}.md"
            return self._send(200, md.encode("utf-8"), "text/markdown; charset=utf-8",
                              {"Content-Disposition": f'attachment; filename="{name}"'})
        return self._static(path)

    def do_POST(self) -> None:
        global STATE
        path = unquote(urlparse(self.path).path)
        parts = [p for p in path.split("/") if p]

        if parts[:2] == ["api", "sources"] and len(parts) == 4 and parts[3] == "run":
            sid = parts[2]
            with LOCK:
                source = next((s for s in STATE["sources"] if s["id"] == sid), None)
                if not source:
                    return self._json(404, {"error": "source not found"})
                result = pipeline.run_source(STATE, source, DOCS, PRIORS)
                store.save(STATE)
            return self._json(200, {"run": result["run"], "summary": store.serialize(STATE)["summary"]})

        if parts[:2] == ["api", "impacts"] and len(parts) == 4 and parts[3] == "review":
            body = self._body()
            with LOCK:
                try:
                    imp = store.review_impact(STATE, parts[2], body.get("decision", "approved"),
                                              body.get("note", ""), body.get("actor", "Reviewer"))
                except KeyError:
                    return self._json(404, {"error": "impact not found"})
                except ValueError as exc:
                    return self._json(400, {"error": str(exc)})
            return self._json(200, {"impact": imp})

        if parts[:2] == ["api", "tasks"] and len(parts) == 4 and parts[3] == "status":
            body = self._body()
            with LOCK:
                try:
                    task = store.set_task_status(STATE, parts[2], body.get("status", "approved"), body.get("actor", "Reviewer"))
                except KeyError:
                    return self._json(404, {"error": "task not found"})
                except ValueError as exc:
                    return self._json(400, {"error": str(exc)})
            return self._json(200, {"task": task})

        if path == "/api/reset":
            with LOCK:
                STATE = store.build_state()
                store.save(STATE)
            return self._json(200, {"ok": True})

        return self._json(404, {"error": "unknown endpoint"})

    def _static(self, path: str) -> None:
        rel = "index.html" if path in ("", "/") else path.lstrip("/")
        target = (WEB / rel).resolve()
        if WEB not in target.parents and target != WEB:
            return self._json(403, {"error": "forbidden"})
        if target.is_dir():
            target = target / "index.html"
        if not target.exists():
            return self._json(404, {"error": "not found"})
        ctype = MIME.get(target.suffix.lower()) or mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        self._send(200, target.read_bytes(), ctype)


def main() -> None:
    port = int(os.environ.get("PORT", "8787"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"\n  Regula · Regulatory Change Impact Agent")
    print(f"  http://127.0.0.1:{port}\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  stopped")


if __name__ == "__main__":
    main()
