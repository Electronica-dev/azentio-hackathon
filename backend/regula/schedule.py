"""Cron-scheduled document sync — stdlib only.

REGULA_SYNC_CRON takes a standard five-field expression (minute hour day month
weekday), e.g. "*/30 * * * *" or "0 9 * * 1-5". Empty or "off" disables it.
Fields accept *, n, a-b, */n, a-b/n and comma lists. Times are server-local.
"""
from __future__ import annotations

import os
import sys
import threading
from datetime import datetime, timedelta
from typing import Callable

FIELDS = (("minute", 0, 59), ("hour", 0, 23), ("day", 1, 31), ("month", 1, 12), ("weekday", 0, 6))
HORIZON = timedelta(days=366 * 4)  # covers Feb 29 schedules


class CronError(ValueError):
    pass


def _field(spec: str, name: str, lo: int, hi: int) -> frozenset[int]:
    values: set[int] = set()
    for part in spec.split(","):
        rng, _, step_s = part.partition("/")
        try:
            step = int(step_s) if step_s else 1
            if rng == "*":
                start, end = lo, hi
            elif "-" in rng:
                a, b = rng.split("-", 1)
                start, end = int(a), int(b)
            else:
                start = int(rng)
                end = hi if step_s else start
        except ValueError:
            raise CronError(f"invalid {name} field: {spec!r}") from None
        if name == "weekday" and end == 7:  # 7 is Sunday too
            values.add(0)
            end = 6 if start <= 6 else 7
            if start == 7:
                continue
        if step < 1 or not (lo <= start <= end <= hi):
            raise CronError(f"{name} out of range {lo}-{hi}: {spec!r}")
        values.update(range(start, end + 1, step))
    return frozenset(values)


class Cron:
    def __init__(self, expr: str):
        parts = expr.split()
        if len(parts) != 5:
            raise CronError(f"expected 5 fields (minute hour day month weekday), got {len(parts)}: {expr!r}")
        self.expr = " ".join(parts)
        self.minute, self.hour, self.day, self.month, self.weekday = (
            _field(p, name, lo, hi) for p, (name, lo, hi) in zip(parts, FIELDS)
        )
        # Vixie cron: when both day and weekday are restricted, either may match.
        self._either = parts[2] != "*" and parts[4] != "*"

    def matches(self, t: datetime) -> bool:
        return (t.minute in self.minute and t.hour in self.hour
                and t.month in self.month and self._day_ok(t))

    def _day_ok(self, t: datetime) -> bool:
        day_ok = t.day in self.day
        dow_ok = (t.weekday() + 1) % 7 in self.weekday  # cron: 0 = Sunday
        return (day_ok or dow_ok) if self._either else (day_ok and dow_ok)

    def next_after(self, after: datetime) -> datetime:
        t = after.replace(second=0, microsecond=0) + timedelta(minutes=1)
        limit = after + HORIZON
        while t <= limit:
            if t.month not in self.month:
                t = (t.replace(day=1, hour=0, minute=0) + timedelta(days=32)).replace(day=1)
            elif not self._day_ok(t):
                t = t.replace(hour=0, minute=0) + timedelta(days=1)
            elif t.hour not in self.hour:
                t = t.replace(minute=0) + timedelta(hours=1)
            elif t.minute not in self.minute:
                t += timedelta(minutes=1)
            else:
                return t
        raise CronError(f"{self.expr!r} never fires")


def parse(expr: str | None) -> Cron | None:
    """None for empty/off, otherwise a Cron. Raises CronError on bad input."""
    expr = (expr or "").strip()
    if expr.lower() in ("", "off", "none", "disabled"):
        return None
    cron = Cron(expr)
    cron.next_after(datetime.now())  # rejects schedules like "0 0 30 2 *"
    return cron


class Scheduler:
    """Background thread that calls `job()` whenever the cron expression fires."""

    def __init__(self, job: Callable[[], dict], expr: str | None = None):
        self._job = job
        self._cron: Cron | None = parse(expr)
        self._wake = threading.Event()
        self._lock = threading.Lock()
        self._next: datetime | None = None
        self.last_run: dict | None = None
        self._thread = threading.Thread(target=self._loop, name="regula-sync", daemon=True)

    @classmethod
    def from_env(cls, job: Callable[[], dict]) -> "Scheduler":
        expr = os.environ.get("REGULA_SYNC_CRON", "")
        try:
            return cls(job, expr)
        except CronError as exc:
            sys.stderr.write(f"  REGULA_SYNC_CRON ignored: {exc}\n")
            return cls(job, None)

    def start(self) -> None:
        self._thread.start()

    def configure(self, expr: str | None) -> dict:
        cron = parse(expr)  # raises before anything changes
        with self._lock:
            self._cron = cron
        self._wake.set()
        return self.status()

    def status(self) -> dict:
        with self._lock:
            cron, nxt = self._cron, self._next
        if cron and (nxt is None or self._wake.is_set()):  # thread not started or mid-reconfigure
            nxt = cron.next_after(datetime.now())
        return {
            "enabled": cron is not None,
            "cron": cron.expr if cron else None,
            "next_run": nxt.isoformat(timespec="minutes") if cron and nxt else None,
            "last_run": self.last_run,
        }

    def _loop(self) -> None:
        while True:
            with self._lock:
                cron = self._cron
                self._next = cron.next_after(datetime.now()) if cron else None
                due = self._next
            self._wake.clear()
            if due is None:
                self._wake.wait()
                continue
            if self._wake.wait(max(0.0, (due - datetime.now()).total_seconds())):
                continue  # reconfigured; recompute
            started = datetime.now().isoformat(timespec="seconds")
            try:
                result = self._job()
                self.last_run = {"started": started, "ok": True, **result}
            except Exception as exc:  # noqa: BLE001 - a failed sync must not kill the thread
                self.last_run = {"started": started, "ok": False, "error": str(exc)}
                sys.stderr.write(f"  scheduled sync failed: {exc}\n")
