import threading


class AudioRingBuffer:
    """
    Thread-safe circular byte buffer for in-memory audio chunks.
    Discards the oldest bytes when capacity is exceeded, preserving the most recent audio.
    """

    def __init__(self, capacity_bytes: int):
        if capacity_bytes <= 0:
            raise ValueError("capacity_bytes must be a positive integer")
        self._capacity = int(capacity_bytes)
        self._buffer = bytearray()
        self._lock = threading.Lock()

    @property
    def capacity_bytes(self) -> int:
        return self._capacity

    def write(self, data: bytes) -> None:
        """Appends raw bytes to the buffer, evicting oldest data if capacity is exceeded."""
        if not data:
            return
        with self._lock:
            self._buffer.extend(data)
            if len(self._buffer) > self._capacity:
                del self._buffer[:-self._capacity]

    def read_all(self) -> bytes:
        """Returns a snapshot copy of all buffered bytes in FIFO order."""
        with self._lock:
            return bytes(self._buffer)

    def clear(self) -> None:
        """Empties the buffer."""
        with self._lock:
            self._buffer.clear()

    def __len__(self) -> int:
        with self._lock:
            return len(self._buffer)
