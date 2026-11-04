#!/usr/bin/env python3
"""
GAIDE-Trace — Claude Code adapter (hook logger).

Reads the hook event JSON from stdin and appends one normalized JSONL line
to the trace store, translated to the tool-agnostic canonical vocabulary
(see schema/event.schema.json and docs/ADAPTERS.md). Designed to be
registered for multiple hook events (SessionStart, UserPromptSubmit,
PostToolUse, Stop, SubagentStop, SessionEnd, ...).

Other tools have their own adapters (e.g. tools/import_antigravity.py for
the Antigravity IDE); all of them write the same record shape, so stores,
server and analyses are shared across LLMs and IDEs.

Guarantees:
- Never blocks the agent: always exits 0, even on internal errors.
- Never prints to stdout (stdout of some hooks is injected into the model context).
- Redacts obvious secrets and truncates oversized payloads (raw fidelity is
  preserved separately via the transcript snapshot at SessionEnd).
- Local-first: the local store is always written before any network I/O, so a
  down/unconfigured server can never lose data.

Optional team server (see server/ and docs/SERVER.md): when configured, each
record is also queued in an outbox and shipped to the central server. Failed
shipments stay queued and are retried on later hook fires — delivery is
at-least-once, and the server dedupes by trace_id.

Environment variables (all optional):
  GAIDE_TRACE_DIR        Store location. Default: <cwd>/.gaide-trace
  GAIDE_TRACE_MAX_FIELD  Max chars kept per captured field. Default: 20000
  GAIDE_TRACE_DISABLE    Set to "1" to disable logging entirely.
  GAIDE_TRACE_PROJECT    Project name reported to the server. Default: basename(cwd)
  GAIDE_TRACE_SERVER     Team server base URL (e.g. https://trace.example.com)
  GAIDE_TRACE_TOKEN      API key for the server (role: agent or member)

Server settings may also live in <store>/config.json ({"server": ..., "token": ...},
written by install.sh --server); environment variables take precedence.
"""

import gzip
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path

SHIP_BATCH = 200          # events per upload request
SHIP_DEADLINE = 8.0       # seconds of total network budget per hook fire

SOURCE = "claude-code"

# Native hook names -> canonical, tool-agnostic event vocabulary.
# The native name is preserved in `native_event` for tool-specific analyses.
CANONICAL_EVENTS = {
    "SessionStart": "session.start",
    "UserPromptSubmit": "prompt.submit",
    "PostToolUse": "tool.call",
    "PostToolUseFailure": "tool.fail",
    "Stop": "turn.end",
    "SubagentStart": "agent.start",
    "SubagentStop": "agent.end",
    "PreCompact": "context.compact",
    "SessionEnd": "session.end",
}

# ---------------------------------------------------------------- redaction

SECRET_PATTERNS = [
    re.compile(r"(?i)(api[_-]?key|secret|token|password|passwd|authorization|bearer)"
               r"(\"?\s*[:=]\s*\"?)([^\s\"',;]{8,})"),
    re.compile(r"sk-[A-Za-z0-9_-]{20,}"),                    # OpenAI/Anthropic-style keys
    re.compile(r"ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}"),  # GitHub
    re.compile(r"AKIA[0-9A-Z]{16}"),                          # AWS access key id
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----"),
]


def redact(text: str) -> str:
    def _kv(m):
        return m.group(1) + m.group(2) + "[REDACTED]"
    text = SECRET_PATTERNS[0].sub(_kv, text)
    for pat in SECRET_PATTERNS[1:]:
        text = pat.sub("[REDACTED]", text)
    return text


def clean(value, max_len):
    """Serialize, redact and truncate any captured value."""
    if value is None:
        return None
    if not isinstance(value, str):
        value = json.dumps(value, ensure_ascii=False, default=str)
    value = redact(value)
    if len(value) > max_len:
        value = value[:max_len] + f"…[truncated, {len(value)} chars total]"
    return value


# ---------------------------------------------------------------- server shipping


def load_config(trace_dir: Path) -> dict:
    """Read <store>/config.json (written by install.sh --server), if present."""
    cfg_file = trace_dir / "config.json"
    if cfg_file.is_file():
        try:
            return json.loads(cfg_file.read_text(encoding="utf-8")) or {}
        except (json.JSONDecodeError, OSError):
            pass
    return {}


def server_config(cfg: dict):
    """Resolve server URL + token from env, falling back to the store config."""
    server = os.environ.get("GAIDE_TRACE_SERVER") or cfg.get("server")
    token = os.environ.get("GAIDE_TRACE_TOKEN") or cfg.get("token")
    if server and token:
        return server.rstrip("/"), token
    return None


# The server URL comes from env/config.json, so it is not trusted to be a web
# URL. urlopen's default opener also handles file://, ftp:// and data:, so a
# crafted "server" would make the hook read local files instead of talking to
# a server. This opener has only the HTTP(S) handlers: other schemes fail.
_OPENER = urllib.request.OpenerDirector()
for _handler in (urllib.request.ProxyHandler(), urllib.request.UnknownHandler(),
                 urllib.request.HTTPHandler(), urllib.request.HTTPSHandler(),
                 urllib.request.HTTPDefaultErrorHandler(),
                 urllib.request.HTTPErrorProcessor()):
    _OPENER.add_handler(_handler)


def http(url: str, token: str, data: bytes, method="POST",
         content_type="application/json", timeout=5.0, gzipped=False):
    if urllib.parse.urlsplit(url).scheme not in ("http", "https"):
        raise ValueError(f"server URL must be http(s): {url!r}")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": content_type}
    if gzipped:
        headers["Content-Encoding"] = "gzip"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    with _OPENER.open(req, timeout=timeout) as resp:
        return 200 <= resp.status < 300


def spool(trace_dir: Path, record: dict):
    """Queue one record for shipment. File-per-record keeps concurrent hook
    processes safe without locks; the server dedupes retries by trace_id."""
    outbox = trace_dir / "outbox"
    outbox.mkdir(parents=True, exist_ok=True)
    tmp = outbox / f".{record['trace_id']}.tmp"
    tmp.write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")
    tmp.replace(outbox / f"{record['trace_id']}.json")


def flush_outbox(trace_dir: Path, server: str, token: str, deadline: float):
    """Ship queued records in batches; delete only what the server accepted."""
    outbox = trace_dir / "outbox"
    if not outbox.is_dir():
        return
    files = sorted(f for f in outbox.iterdir()
                   if f.suffix == ".json" and not f.name.startswith("."))
    for start in range(0, len(files), SHIP_BATCH):
        if time.monotonic() > deadline:
            return
        batch = files[start:start + SHIP_BATCH]
        records = []
        for f in batch:
            try:
                records.append(json.loads(f.read_text(encoding="utf-8")))
            except (json.JSONDecodeError, OSError):
                f.unlink(missing_ok=True)  # poisoned entry: drop from queue
        if not records:
            continue
        body = json.dumps(records, ensure_ascii=False).encode("utf-8")
        gzipped = len(body) > 8192
        if gzipped:
            body = gzip.compress(body)
        try:
            ok = http(f"{server}/api/v1/events", token, body, gzipped=gzipped,
                      timeout=min(5.0, max(1.0, deadline - time.monotonic())))
        except (urllib.error.URLError, OSError, ValueError):
            return  # server unreachable: keep the queue, retry on a later fire
        if ok:
            for f in batch:
                f.unlink(missing_ok=True)


def ship_transcript(trace_dir: Path, server: str, token: str,
                    session_id: str, snapshot: Path, project, deadline: float):
    """Upload the snapshot unless the last successful upload had the same size."""
    state_file = trace_dir / "outbox" / ".transcripts.json"
    try:
        shipped = json.loads(state_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        shipped = {}
    size = snapshot.stat().st_size
    if shipped.get(session_id) == size:
        return
    if time.monotonic() > deadline:
        return
    body = gzip.compress(snapshot.read_bytes())
    url = f"{server}/api/v1/transcripts/{session_id}"
    if project:
        url += "?project=" + urllib.request.quote(str(project))
    try:
        ok = http(url, token, body, method="PUT",
                  content_type="application/x-ndjson", gzipped=True,
                  timeout=min(8.0, max(2.0, deadline - time.monotonic() + 4)))
    except (urllib.error.URLError, OSError, ValueError):
        return
    if ok:
        shipped[session_id] = size
        state_file.parent.mkdir(parents=True, exist_ok=True)
        tmp = state_file.with_suffix(".tmp")
        tmp.write_text(json.dumps(shipped), encoding="utf-8")
        tmp.replace(state_file)


# ---------------------------------------------------------------- main


def main() -> None:
    if os.environ.get("GAIDE_TRACE_DISABLE") == "1":
        return

    raw = sys.stdin.read()
    try:
        event = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        event = {"_parse_error": True, "_raw_head": raw[:500]}

    max_len = int(os.environ.get("GAIDE_TRACE_MAX_FIELD", "20000"))
    cwd = event.get("cwd") or os.getcwd()
    trace_dir = Path(os.environ.get("GAIDE_TRACE_DIR") or Path(cwd) / ".gaide-trace")
    events_dir = trace_dir / "events"
    events_dir.mkdir(parents=True, exist_ok=True)
    cfg = load_config(trace_dir)
    project = (os.environ.get("GAIDE_TRACE_PROJECT") or cfg.get("project")
               or Path(cwd).name)

    session_id = event.get("session_id") or "unknown-session"
    native = event.get("hook_event_name") or (sys.argv[1] if len(sys.argv) > 1 else "unknown")
    record = {
        "trace_id": uuid.uuid4().hex[:12],
        "ts": datetime.now(timezone.utc).isoformat(),
        "event": CANONICAL_EVENTS.get(native, "note"),
        "native_event": native,
        "source": SOURCE,
        "session_id": session_id,
        "prompt_id": event.get("prompt_id"),
        "project": project,
        "cwd": cwd,
        "permission_mode": event.get("permission_mode"),
        "model": event.get("model"),
        "agent_id": event.get("agent_id"),
        "agent_type": event.get("agent_type"),
        "tool_name": event.get("tool_name"),
        "tool_use_id": event.get("tool_use_id"),
        "tool_input": clean(event.get("tool_input"), max_len),
        "tool_response": clean(event.get("tool_response"), max_len),
        "prompt": clean(event.get("prompt"), max_len),
        "last_assistant_message": clean(event.get("last_assistant_message"), max_len),
        "transcript_path": event.get("transcript_path"),
    }
    # Drop empty fields to keep the JSONL lean.
    record = {k: v for k, v in record.items() if v is not None}

    # Local store is written FIRST and unconditionally — the server is an
    # additional destination, never a dependency.
    out_file = events_dir / f"{session_id}.jsonl"
    with out_file.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False) + "\n")

    # On session end, snapshot the full transcript before Claude Code's
    # retention cleanup can delete it. The transcript is the highest-fidelity
    # record (full messages, tool calls, token usage per turn).
    snapshot = None
    if record["event"] in ("session.end", "turn.end"):
        src = event.get("transcript_path")
        if src and Path(src).is_file():
            snap_dir = trace_dir / "transcripts"
            snap_dir.mkdir(parents=True, exist_ok=True)
            dst = snap_dir / f"{session_id}.jsonl"
            try:
                data = Path(src).read_bytes()
                # Overwrite: each snapshot supersedes the previous partial one.
                dst.write_bytes(data)
                snapshot = dst
            except OSError:
                pass

    # Team server shipping (optional, best-effort, never raises past here).
    remote = server_config(cfg)
    if remote:
        server, token = remote
        deadline = time.monotonic() + SHIP_DEADLINE
        try:
            spool(trace_dir, record)
            flush_outbox(trace_dir, server, token, deadline)
            if snapshot is not None:
                ship_transcript(trace_dir, server, token, session_id,
                                snapshot, project, deadline)
        except Exception:
            pass  # shipping problems must never cost a working session


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Trace logging must never break the agent session.
        pass
    sys.exit(0)
