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
#
# Spec: specs/capture-redaction/spec.md (issue #3). Two facts shape the rules:
#
# 1. redact() runs on text that clean() has already JSON-serialized, so a shell
#    command such as   curl -H "Authorization: Bearer <jwt>"   arrives as
#    curl -H \"Authorization: Bearer <jwt>\"  and every quoting rule has to
#    accept a backslash-escaped quote, and must not swallow the backslash, or
#    the stored field stops being valid JSON.
# 2. An HTTP scheme sits between the key and the credential
#    (Authorization: Bearer <token>), so a plain key/value rule sees the
#    6-letter scheme name, not the token.
#
# Rules are biased toward false positives: masking a harmless word costs one
# token of research data, missing a credential ships it to a shared server.
# Context (key name, scheme) is kept and only the value is masked, so analyses
# still see that a credential was used and how. All patterns are linear
# (bounded quantifiers, no nested unbounded ones) so a hostile payload cannot
# stall the hook (D4); redaction runs before truncation, on the whole field.

_KEYWORD = r"(?:api[_-]?key|secret|token|password|passwd|authorization|bearer)"
# `AWS_SECRET_ACCESS_KEY`, `password_hash`: the keyword may carry a suffix, as
# long as it starts with _ or - so that `secretary:` stays prose. The suffix is
# bounded: unbounded, every keyword inside one long `token_token_…` run would
# scan to the end of the run and the rule went quadratic (D4).
_KEY_SUFFIX = r"(?:[_-][A-Za-z0-9_-]{0,32})?"
# A quote as the serializer may have left it: `"`, `\"` (one level of JSON
# escaping) or `\\\"` (a quote the user had already escaped in the shell).
_Q = r"\\*"
# Whitespace, including a serialized tab or newline (`\t`, `\n`).
_WS = r"(?:\s|\\[tn])*"
_WS1 = r"(?:\s|\\[tn])+"
# Schemes masked wherever they appear (RFC 7235 token68 credentials)...
_SCHEME = r"(?:bearer|basic|negotiate|ntlm)"
# ...and the wider set accepted between an `Authorization`-style key and its
# value, where the context leaves no doubt (`Authorization: Token <opaque>`).
_OPT_SCHEME = r"(?:(?:bearer|basic|negotiate|ntlm|token|apikey|api-key|digest)" + _WS1 + r")?"
# RFC 7235 token68, required to look like a credential (a digit, a token68
# symbol, or a lowercase-to-uppercase transition) so that prose such as
# "Basic Authentication" is left alone. The transition check opts out of the
# pattern-wide (?i), which would otherwise make it match any two letters.
# Once it looks like one, the credential runs to whitespace or a quote
# (`abc12345|rest` is masked whole), never ending on an escaped quote's
# backslash, so the stored JSON stays intact.
_TOKEN68 = (r"(?=[A-Za-z0-9._~+/=-]*(?:[0-9._~+/=-]|(?-i:[a-z][A-Z])))"
            r"[A-Za-z0-9._~+/-]{8,}[^\s\"']*(?<!\\)")
# A value that is already the marker is skipped, so redaction is idempotent.
_NOT_MARK = r"(?!" + _OPT_SCHEME + r"\[REDACTED\])"
# A JSON number (`0.00012345`, `-12345678`, `1.5e-10`) under a sensitive key is
# a count or a price, and masking it without quotes would break the record.
_NOT_NUMBER = r"(?!-?\d+(?:\.\d+)?(?:e[-+]?\d+)?(?![^\s\"',;{}\[\]]))"
# A quoted value may be long (SAML assertions, Kerberos blobs); the bound only
# caps what one keyword occurrence can cost when its closing quote is missing.
_MAX_QUOTED = 8192


def _quoted(name, opening, terminator):
    """A quoted value: `opening` (a group) then up to _MAX_QUOTED characters
    that are not the `terminator`, then the terminator itself."""
    return (r"(?P<" + name + r">" + opening + r")" + _NOT_MARK
            + r"(?P<" + name + r"_scheme>" + _OPT_SCHEME + r")"
            + r"(?:(?!" + terminator + r")[^\n]){8," + str(_MAX_QUOTED) + r"}"
            + r"(?P<" + name + r"_end>" + terminator + r")")


# Quote forms the serializer produces, each with the only terminator that
# matches its depth:
#  * depth 0 `"` (a JSON string of the record itself) ends at a `"` preceded
#    by an even run of backslashes (`\\"` closes, `\"` is a quote inside);
#  * depth 1+ `\"` (a quote inside a serialized command) ends at a `"` carrying
#    exactly the opening's backslashes and nothing more, so a `\\\"` inside
#    the value does not end it;
#  * `'` is never escaped by the serializer; a `'` with any backslash before
#    it is kept inside the value (over-masking beats a leak, rule 6).
_EVEN_BS = r"(?<!\\)(?:\\\\)*"
_DQ0 = _quoted("dq0", r"(?<!\\)\"", _EVEN_BS + r"\"")
_DQ1 = _quoted("dq1", r"(?<!\\)(?P<dq1_bs>(?:\\\\)*\\)\"", r"(?<!\\)(?P=dq1_bs)\"")
_SQ = _quoted("sq", r"(?<!\\)'", r"(?<!\\)'")

# key/value: `<keyword>[suffix] [quote] <sep> [quote] [scheme] <value> [quote]`
# A quoted value runs to its closing quote, so punctuation, escaped quotes or
# backslashes inside the credential (`it's`, `a,b`, `x\"y`) cannot end the
# match early. A bare value runs to whitespace or a quote, never ending on the
# backslash of an escaped quote, is never a JSON number, and its first
# non-digit character must be credential-like (no JSON delimiter).
KEY_VALUE_PATTERN = re.compile(
    r"(?i)(?P<key>" + _KEYWORD + _KEY_SUFFIX + r")"
    r"(?P<sep>" + _Q + r"[\"']?" + _WS + r"[:=]" + _WS + r")"
    r"(?:" + _DQ0 + r"|" + _DQ1 + r"|" + _SQ + r"|"
    + _NOT_MARK + _NOT_NUMBER + r"(?P<bare_scheme>" + _OPT_SCHEME + r")"
    + r"(?=\d*[^\d\s\"',;{}\[\]\\])[^\s\"']{8,}(?<!\\)"
    r")")

AUTH_SCHEME_PATTERN = re.compile(r"(?i)\b(" + _SCHEME + r")(" + _WS1 + r")" + _NOT_MARK + _TOKEN68)

SECRET_PATTERNS = [
    # JWT, twin of the server's `jwt` scan rule. The lookbehind, not \b, is the
    # start anchor: `-` is both a word boundary and a member of the class, so
    # with \b a run like `-eyJ-eyJ-eyJ…` gave every `eyJ` a fresh start and the
    # scan went quadratic (D4).
    re.compile(r"(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}"),
    re.compile(r"sk-[A-Za-z0-9_-]{20,}"),                    # OpenAI/Anthropic-style keys
    re.compile(r"ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}"),  # GitHub
    re.compile(r"AKIA[0-9A-Z]{16}"),                          # AWS access key id
    # A key block runs to its END marker or, when the capture was cut before
    # one (`head -5 id_rsa`), to the end of its JSON string (an unescaped `"`)
    # or of the text: a truncated key is still a key, and the sibling fields
    # of the record survive. Tempered, so each character is consumed once (D4).
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----(?:(?!-----END |(?<!\\)\")[\s\S])*"
               r"(?:-----END [A-Z ]*PRIVATE KEY-----)?"),
]


def redact(text: str) -> str:
    def _keep_context(m):
        g = m.groupdict(default="")
        opening = (g["dq0"] + g["dq0_scheme"] + g["dq1"] + g["dq1_scheme"]
                   + g["sq"] + g["sq_scheme"] + g["bare_scheme"])
        closing = g["dq0_end"] + g["dq1_end"] + g["sq_end"]
        return g["key"] + g["sep"] + opening + "[REDACTED]" + closing

    def _keep_scheme(m):
        return m.group(1) + m.group(2) + "[REDACTED]"

    text = KEY_VALUE_PATTERN.sub(_keep_context, text)
    text = AUTH_SCHEME_PATTERN.sub(_keep_scheme, text)
    for pat in SECRET_PATTERNS:
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
