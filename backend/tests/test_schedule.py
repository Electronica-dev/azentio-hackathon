"""Cron parsing and scheduler tests (no real waiting)."""
from __future__ import annotations

import sys
import threading
import unittest
from datetime import datetime
from pathlib import Path

APP = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(APP))

from regula import schedule  # noqa: E402

T = datetime(2026, 10, 31, 10, 7)  # a Saturday


class CronTests(unittest.TestCase):
    def nxt(self, expr: str, after: datetime = T) -> datetime:
        return schedule.Cron(expr).next_after(after)

    def test_every_n_minutes(self):
        self.assertEqual(self.nxt("*/15 * * * *"), datetime(2026, 10, 31, 10, 15))

    def test_daily_at_time_rolls_to_tomorrow(self):
        self.assertEqual(self.nxt("0 9 * * *"), datetime(2026, 11, 1, 9, 0))

    def test_weekdays_skip_the_weekend(self):
        self.assertEqual(self.nxt("30 8 * * 1-5"), datetime(2026, 11, 2, 8, 30))

    def test_seven_is_sunday(self):
        self.assertEqual(self.nxt("0 0 * * 7"), datetime(2026, 11, 1, 0, 0))

    def test_lists_and_month_rollover(self):
        self.assertEqual(self.nxt("0 6,18 1 * *"), datetime(2026, 11, 1, 6, 0))

    def test_day_or_weekday_when_both_restricted(self):
        # 15th of the month OR any Monday, whichever comes first
        self.assertEqual(self.nxt("0 0 15 * 1"), datetime(2026, 11, 2, 0, 0))

    def test_leap_day(self):
        self.assertEqual(self.nxt("0 0 29 2 *"), datetime(2028, 2, 29, 0, 0))

    def test_rejects_bad_expressions(self):
        for bad in ("* * * *", "60 * * * *", "*/0 * * * *", "a * * * *", "0 0 30 2 *"):
            with self.subTest(bad=bad), self.assertRaises(schedule.CronError):
                schedule.parse(bad)

    def test_off_disables(self):
        for off in (None, "", "  ", "off"):
            self.assertIsNone(schedule.parse(off))


class SchedulerTests(unittest.TestCase):
    def test_configure_reports_status_and_rejects_bad_cron(self):
        s = schedule.Scheduler(lambda: {})
        self.assertFalse(s.status()["enabled"])
        status = s.configure("*/5 * * * *")
        self.assertTrue(status["enabled"])
        self.assertEqual(status["cron"], "*/5 * * * *")
        self.assertIsNotNone(status["next_run"])
        with self.assertRaises(schedule.CronError):
            s.configure("nonsense")
        self.assertEqual(s.status()["cron"], "*/5 * * * *")
        self.assertFalse(s.configure("off")["enabled"])

    def test_job_runs_when_due_and_failures_are_recorded(self):
        ran = threading.Event()

        def job():
            ran.set()
            raise RuntimeError("feed down")

        s = schedule.Scheduler(job, "* * * * *")
        s._cron.next_after = lambda after: datetime.now()  # due immediately
        s.start()
        self.assertTrue(ran.wait(2))
        for _ in range(100):
            if s.last_run:
                break
            threading.Event().wait(0.01)
        self.assertEqual(s.last_run["ok"], False)
        self.assertIn("feed down", s.last_run["error"])
        s.configure(None)  # park the thread


if __name__ == "__main__":
    unittest.main()
