"""Real-time DSP Voice Bandpass Filter (300 Hz - 3200 Hz) for 24 kHz communication audio."""
import numpy as np


class VoiceBandpassFilter:
    """
    Direct Form II Transposed IIR bandpass filter cascaded from:
    1. 2nd-order Highpass at 300 Hz (suppresses sub-audible CTCSS, DC bias, and carrier rumble)
    2. 2nd-order Lowpass at 3200 Hz (suppresses RF thermal noise, IF hiss, and FM discriminator noise)
    Maintains filter state across consecutive 50ms audio chunks to avoid phase discontinuity clicks.
    """

    def __init__(self, sample_rate: int = 24000):
        self.sample_rate = int(sample_rate)
        # Highpass 300 Hz (Q = 0.7071)
        w0_hp = 2.0 * np.pi * 300.0 / self.sample_rate
        alpha_hp = np.sin(w0_hp) / (2.0 * 0.7071)
        cos_hp = np.cos(w0_hp)
        a0_hp = 1.0 + alpha_hp
        self.b_hp = np.array([(1.0 + cos_hp) / 2.0, -(1.0 + cos_hp), (1.0 + cos_hp) / 2.0]) / a0_hp
        self.a_hp = np.array([-2.0 * cos_hp, 1.0 - alpha_hp]) / a0_hp

        # Lowpass 3200 Hz (Q = 0.7071)
        w0_lp = 2.0 * np.pi * 3200.0 / self.sample_rate
        alpha_lp = np.sin(w0_lp) / (2.0 * 0.7071)
        cos_lp = np.cos(w0_lp)
        a0_lp = 1.0 + alpha_lp
        self.b_lp = np.array([(1.0 - cos_lp) / 2.0, 1.0 - cos_lp, (1.0 - cos_lp) / 2.0]) / a0_lp
        self.a_lp = np.array([-2.0 * cos_lp, 1.0 - alpha_lp]) / a0_lp

        self.reset()

    def reset(self) -> None:
        """Resets filter memory delay lines."""
        self.s_hp1 = 0.0
        self.s_hp2 = 0.0
        self.s_lp1 = 0.0
        self.s_lp2 = 0.0

    def process(self, chunk: bytes) -> bytes:
        """Filters a raw 16-bit signed PCM mono audio chunk and returns filtered PCM bytes."""
        if not chunk or len(chunk) < 2:
            return chunk

        valid_len = len(chunk) - (len(chunk) % 2)
        samples = np.frombuffer(chunk[:valid_len], dtype=np.int16).astype(np.float64)
        if len(samples) == 0:
            return chunk

        # Stage 1: Highpass 300 Hz (Direct Form II Transposed)
        y_hp = np.empty_like(samples)
        b0_h, b1_h, b2_h = self.b_hp
        a1_h, a2_h = self.a_hp
        s1_h, s2_h = self.s_hp1, self.s_hp2

        for i in range(len(samples)):
            xi = samples[i]
            yi = b0_h * xi + s1_h
            s1_h = b1_h * xi - a1_h * yi + s2_h
            s2_h = b2_h * xi - a2_h * yi
            y_hp[i] = yi

        self.s_hp1, self.s_hp2 = s1_h, s2_h

        # Stage 2: Lowpass 3200 Hz (Direct Form II Transposed)
        y_lp = np.empty_like(y_hp)
        b0_l, b1_l, b2_l = self.b_lp
        a1_l, a2_l = self.a_lp
        s1_l, s2_l = self.s_lp1, self.s_lp2

        for i in range(len(y_hp)):
            xi = y_hp[i]
            yi = b0_l * xi + s1_l
            s1_l = b1_l * xi - a1_l * yi + s2_l
            s2_l = b2_l * xi - a2_l * yi
            y_lp[i] = yi

        self.s_lp1, self.s_lp2 = s1_l, s2_l

        filtered = np.clip(y_lp, -32768, 32767).astype(np.int16).tobytes()
        if len(chunk) > valid_len:
            filtered += chunk[valid_len:]
        return filtered
