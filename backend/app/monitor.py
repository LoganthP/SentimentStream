"""Samples memory of the API process + Spark JVM while a job runs."""
import threading
import time

import psutil


def current_rss_mb() -> float:
    proc = psutil.Process()
    total = proc.memory_info().rss
    for child in proc.children(recursive=True):  # the Spark JVM is a child process
        try:
            total += child.memory_info().rss
        except psutil.Error:
            pass
    return total / (1024 * 1024)


class MemoryMonitor:
    def __init__(self, interval: float = 0.25):
        self.interval = interval
        self.peak = 0.0
        self.start_mb = 0.0
        self._stop = threading.Event()
        self._t = threading.Thread(target=self._run, daemon=True)

    def _run(self):
        while not self._stop.is_set():
            self.peak = max(self.peak, current_rss_mb())
            time.sleep(self.interval)

    def __enter__(self):
        self.start_mb = current_rss_mb()
        self.peak = self.start_mb
        self._t.start()
        return self

    def __exit__(self, *exc):
        self._stop.set()
        self._t.join(timeout=2)
        self.peak = max(self.peak, current_rss_mb())
