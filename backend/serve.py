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

from regula import audit, changes, chunks, extract_api, org, pipeline, relate, rss, schedule, store, upload  # noqa: E402

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


def sync_documents(limit: int = 3, ingest: bool = True, actor: str = "Discovery Service") -> dict:
    """One discovery cycle: fetch feeds, ingest the newest directives, persist."""
    with LOCK:
        run = rss.discover(STATE, actor=actor)
        run["ingested"] = rss.ingest_new(STATE, limit=limit, actor=actor) if ingest else []
        store.save(STATE)
    return run


def _scheduled_sync() -> dict:
    try:
        limit = max(0, min(20, int(os.environ.get("REGULA_SYNC_LIMIT", "3"))))
    except ValueError:
        limit = 3
    run = sync_documents(limit=limit, actor="Scheduled Sync")
    return {"run": run["id"], **run["stats"], "ingested": len(run["ingested"]), "errors": len(run["errors"])}


SCHEDULER = schedule.Scheduler.from_env(_scheduled_sync)


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
        if path in ("/api/sync/schedule", "/api/sync/schedule/"):
            return self._json(200, SCHEDULER.status())
        if path in ("/api/org", "/api/org/"):
            return self._json(200, org.snapshot())
        if path in ("/api/internal/documents", "/api/internal/documents/"):
            data = org.snapshot()
            counts = chunks.counts()
            documents = [{**doc, "chunks": counts.get(doc["id"], 0)} for doc in data["documents"]]
            return self._json(200, {"documents": documents, "categories": data["categories"]})
        if path.startswith("/api/internal/documents/"):
            rest = [part for part in path.split("/") if part]
            if len(rest) == 5 and rest[4] == "chunks":
                doc_id = rest[3]
                if not any(doc["id"] == doc_id for doc in org.snapshot()["documents"]):
                    return self._json(404, {"error": "document not found"})
                return self._json(200, {"document_id": doc_id, "chunks": chunks.load_chunks(doc_id)})
        if path in ("/api/overview", "/api/overview/"):
            with LOCK:
                return self._json(200, org.overview(STATE))
        if path in ("/api/changes", "/api/changes/"):
            with LOCK:
                items = changes.build_changes(STATE)
                return self._json(200, {"changes": items, "summary": changes.summary(items)})
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

        if path in ("/api/discover", "/api/discover/"):
            body = self._body()
            try:
                limit = max(0, min(20, int(body.get("limit", 3))))
            except (TypeError, ValueError):
                limit = 3
            ingest = body.get("ingest", True) is not False
            return self._json(200, sync_documents(limit=limit, ingest=ingest))

        if path in ("/api/sync/schedule", "/api/sync/schedule/"):
            try:
                return self._json(200, SCHEDULER.configure(self._body().get("cron")))
            except schedule.CronError as exc:
                return self._json(400, {"error": str(exc)})

        if path in ("/api/extract", "/api/extract/"):
            body = self._body()
            try:
                payload = extract_api.extract_document(body, STATE)
            except ValueError as exc:
                return self._json(400, {"error": str(exc)})
            except Exception as exc:  # noqa: BLE001 - never 500 on user input
                return self._json(400, {"error": f"could not extract: {exc}"})
            return self._json(200, payload)

        if parts[:3] == ["api", "sources", "upload"]:
            body = self._body()
            with LOCK:
                try:
                    result = upload.ingest(STATE, body, actor=body.get("actor") or "Manual upload")
                except ValueError as exc:
                    return self._json(400, {"error": str(exc)})
                except Exception as exc:  # noqa: BLE001 - never 500 on a bad file
                    return self._json(400, {"error": f"could not ingest upload: {exc}"})
                store.save(STATE)
            return self._json(200, result)

        if parts[:2] == ["api", "sources"] and len(parts) == 4 and parts[3] == "relate":
            body = self._body()
            with LOCK:
                source = next((s for s in STATE["sources"] if s["id"] == parts[2]), None)
                if not source:
                    return self._json(404, {"error": "source not found"})
                verdict = relate.assist(relate.relate_state(STATE, source), source)
                applied = bool(body.get("apply")) and verdict["status"] == "linked"
                run = None
                if applied:
                    relate.apply_relationship(STATE, source, verdict)
                    run = pipeline.run_source(STATE, source, DOCS, PRIORS)["run"]
                store.save(STATE)
            return self._json(200, {"relationship": verdict, "applied": applied, "run": run})

        if parts[:2] == ["api", "sources"] and len(parts) == 4 and parts[3] == "link":
            body = self._body()
            actor = body.get("actor") or "Reviewer"
            with LOCK:
                source = next((s for s in STATE["sources"] if s["id"] == parts[2]), None)
                prior = next((s for s in STATE["sources"] if s["id"] == body.get("prior_source_id")), None)
                if not source or not prior:
                    return self._json(404, {"error": "source not found"})
                source["prior_doc"] = prior.get("doc")
                source["relationship"] = {
                    "status": "linked",
                    "prior_source_id": prior["id"],
                    "prior_document_id": prior["id"],
                    "confidence": 1.0,
                    "rationale": f"Confirmed by {actor}.",
                    "pinned": False,
                    "signals": [{"name": "human_confirmed", "value": 1.0,
                                 "detail": f"{actor} selected this predecessor"}],
                    "alternatives": [],
                }
                run = pipeline.run_source(STATE, source, DOCS, PRIORS)["run"]
                audit.add(STATE, actor, "relationship.confirmed", source.get("ref") or source["id"],
                          f"prior → {prior['id']}")
                store.save(STATE)
            return self._json(200, {"source": source, "relationship": source["relationship"], "run": run})

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

        if parts[:2] == ["api", "org"] and len(parts) >= 3:
            return self._org(parts[2:])

        if path == "/api/reset":
            with LOCK:
                STATE = store.build_state()
                store.save(STATE)
            return self._json(200, {"ok": True})

        return self._json(404, {"error": "unknown endpoint"})

    def _org(self, rest: list[str]) -> None:
        """POST /api/org/{documents|assets|people} adds; /api/org/{kind}/{id}/delete removes."""
        kind = rest[0]
        if kind not in ("documents", "assets", "people"):
            return self._json(404, {"error": "unknown endpoint"})
        if len(rest) == 3 and rest[2] == "delete":
            try:
                with LOCK:
                    if kind == "documents":
                        org.delete_document(rest[1])
                    elif kind == "assets":
                        org.delete_asset(STATE, rest[1])
                        store.save(STATE)
                    else:
                        org.delete_person(rest[1])
            except KeyError:
                return self._json(404, {"error": f"{kind[:-1] if kind != 'people' else 'person'} not found"})
            return self._json(200, {"ok": True})
        if len(rest) != 1:
            return self._json(404, {"error": "unknown endpoint"})
        body = self._body()
        try:
            with LOCK:
                if kind == "documents":
                    added = org.add_documents(body, actor=body.get("actor") or "Organisation upload")
                elif kind == "assets":
                    added = org.add_assets(STATE, body)
                    store.save(STATE)
                else:
                    added = org.add_people(body)
        except ValueError as exc:
            return self._json(400, {"error": str(exc)})
        return self._json(200, {"added": added})

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
    print(f"  http://127.0.0.1:{port}")
    sync = SCHEDULER.status()
    print(f"  document sync: {sync['cron'] + ' (next ' + sync['next_run'] + ')' if sync['enabled'] else 'manual only'}\n")
    SCHEDULER.start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  stopped")


if __name__ == "__main__":
    main()
