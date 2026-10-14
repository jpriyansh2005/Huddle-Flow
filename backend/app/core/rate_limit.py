"""Counting failures per key, to slow down password guessing."""

import threading
from collections import deque
from collections.abc import Callable
from datetime import datetime, timedelta

from app.core.time import utc_now


class FailureLimiter:
    """Blocks a key after too many failures within a sliding time window.

    It lives in memory, which suits this single-process server: a restart
    forgets the counts. The login route runs in FastAPI's thread pool, so the
    counts are guarded by a lock.
    """

    def __init__(
        self,
        max_failures: int,
        window: timedelta,
        clock: Callable[[], datetime] = utc_now,
    ) -> None:
        self.max_failures = max_failures
        self.window = window
        self._clock = clock
        self._failures: dict[str, deque[datetime]] = {}
        self._lock = threading.Lock()

    def is_blocked(self, key: str) -> bool:
        with self._lock:
            return len(self._recent(key)) >= self.max_failures

    def record_failure(self, key: str) -> None:
        with self._lock:
            self._recent(key).append(self._clock())

    def reset(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._failures.clear()

    def _recent(self, key: str) -> deque[datetime]:
        """The key's failures inside the window; older ones are dropped."""
        failures = self._failures.setdefault(key, deque())
        oldest_allowed = self._clock() - self.window
        while failures and failures[0] <= oldest_allowed:
            failures.popleft()
        return failures
