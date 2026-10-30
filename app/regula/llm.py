"""Optional LLM adapter.

The demo path is deliberately deterministic: no network, no key, no model call.
This adapter exists for problem statements that explicitly require free-text
reasoning (e.g. "explain this obligation in plain language"). It is not wired
into the pipeline by default.

Enable with:
    REGULA_LLM_BASE_URL=https://api.openai.com/v1
    REGULA_LLM_API_KEY=...
    REGULA_LLM_MODEL=gpt-4o-mini

`complete()` raises on failure; callers must fall back to the rule-based output.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

BASE_URL = os.environ.get("REGULA_LLM_BASE_URL", "").rstrip("/")
API_KEY = os.environ.get("REGULA_LLM_API_KEY", "")
MODEL = os.environ.get("REGULA_LLM_MODEL", "")


def enabled() -> bool:
    return bool(BASE_URL and API_KEY and MODEL)


def complete(system: str, user: str, *, temperature: float = 0.1, timeout: float = 25.0) -> str:
    """OpenAI-compatible chat completion. Callers must handle exceptions."""
    if not enabled():
        raise RuntimeError("LLM adapter is not configured")
    payload = json.dumps({
        "model": MODEL,
        "temperature": temperature,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }).encode("utf-8")
    request = urllib.request.Request(
        f"{BASE_URL}/chat/completions",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_KEY}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        raise RuntimeError(f"LLM call failed: {exc}") from exc
    try:
        return body["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError("LLM response did not contain a message") from exc
