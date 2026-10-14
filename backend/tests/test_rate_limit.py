from datetime import UTC, datetime, timedelta

from app.core.rate_limit import FailureLimiter


class FakeClock:
    def __init__(self) -> None:
        self.now = datetime(2026, 1, 1, tzinfo=UTC)

    def __call__(self) -> datetime:
        return self.now


def test_blocks_after_the_maximum_and_unblocks_when_the_window_passes():
    clock = FakeClock()
    limiter = FailureLimiter(max_failures=3, window=timedelta(minutes=10), clock=clock)

    for _ in range(3):
        assert not limiter.is_blocked("a@example.com")
        limiter.record_failure("a@example.com")
    assert limiter.is_blocked("a@example.com")

    clock.now += timedelta(minutes=10)
    assert not limiter.is_blocked("a@example.com")


def test_old_failures_slide_out_one_at_a_time():
    clock = FakeClock()
    limiter = FailureLimiter(max_failures=2, window=timedelta(minutes=10), clock=clock)

    limiter.record_failure("a")
    clock.now += timedelta(minutes=6)
    limiter.record_failure("a")
    assert limiter.is_blocked("a")

    clock.now += timedelta(minutes=5)  # the first failure is now 11 minutes old
    assert not limiter.is_blocked("a")


def test_keys_are_counted_separately_and_reset_clears_one():
    limiter = FailureLimiter(max_failures=1, window=timedelta(minutes=1))

    limiter.record_failure("a")
    limiter.record_failure("b")
    limiter.reset("a")

    assert not limiter.is_blocked("a")
    assert limiter.is_blocked("b")
