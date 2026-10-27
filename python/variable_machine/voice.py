"""Change a spoken WAV into another voice, after the model has spoken it.

    python python/variable_machine/voice.py <robot|baritone> <in.wav> <out.wav>

Soprano has one voice on purpose. These are that voice, changed by plain
signal processing (numpy and scipy, nothing learned), so a student can read
exactly what each one does:

- baritone: the pitch eight semitones lower, at the same speed: Soprano
  speaks at about 250 Hz, this at about 170. Ten semitones (about 150 Hz)
  lowers the vowels with the pitch so far that the listening model heard only
  "doo doo doo"; eight, it heard every word. A phase vocoder makes
  the sound shorter without changing its pitch, then playing it back slower
  brings it to its first length and lowers the pitch.
- robot: ring modulation (multiplied by a 40 Hz sine wave), the classic radio
  robot, plus a very short echo for a metal ring.
"""

import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import resample


def read(path: str) -> tuple[int, np.ndarray]:
    rate, x = wavfile.read(path)
    if x.dtype.kind == "i":
        x = x / float(np.iinfo(x.dtype).max)
    x = x.astype(np.float64)
    if x.ndim > 1:
        x = x.mean(axis=1)
    return rate, x


def write(path: str, rate: int, x: np.ndarray) -> None:
    peak = np.max(np.abs(x)) or 1.0
    x = x / peak * 0.9  # as loud as the original, without clipping
    wavfile.write(path, rate, (x * 32767).astype(np.int16))


def stretch(x: np.ndarray, factor: float, n: int = 2048, hop: int = 256) -> np.ndarray:
    """Longer by `factor`, same pitch: a phase vocoder."""
    window = np.hanning(n)
    frames = [np.fft.rfft(window * x[i : i + n]) for i in range(0, len(x) - n, hop)]
    if len(frames) < 2:
        return x
    spec = np.array(frames)
    steps = np.arange(0, len(spec) - 1, 1 / factor)
    expected = 2 * np.pi * hop * np.arange(spec.shape[1]) / n
    phase = np.angle(spec[0])
    out = np.zeros(len(steps) * hop + n)
    for k, t in enumerate(steps):
        i = int(t)
        a, b = spec[i], spec[i + 1]
        mag = (1 - (t - i)) * np.abs(a) + (t - i) * np.abs(b)
        out[k * hop : k * hop + n] += window * np.fft.irfft(mag * np.exp(1j * phase), n)
        delta = np.angle(b) - np.angle(a) - expected
        phase += expected + (delta + np.pi) % (2 * np.pi) - np.pi
    return out


def baritone(rate: int, x: np.ndarray, semitones: float = -8) -> np.ndarray:
    ratio = 2 ** (semitones / 12)  # below 1: lower
    shorter = stretch(x, ratio)
    return resample(shorter, len(x))


def robot(rate: int, x: np.ndarray, carrier: float = 40, echo_ms: float = 6) -> np.ndarray:
    t = np.arange(len(x)) / rate
    y = x * np.sin(2 * np.pi * carrier * t)
    d = int(rate * echo_ms / 1000)
    y[d:] += 0.5 * y[:-d]
    return y


VOICES = {"baritone": baritone, "robot": robot}


def main() -> None:
    if len(sys.argv) != 4 or sys.argv[1] not in VOICES:
        sys.exit(f"usage: python python/variable_machine/voice.py <{'|'.join(VOICES)}> <in.wav> <out.wav>")
    voice, src, dest = sys.argv[1:]
    rate, x = read(src)
    write(dest, rate, VOICES[voice](rate, x))
    print(f"{voice}: {src} → {dest} ({len(x) / rate:.1f} s)")


if __name__ == "__main__":
    main()
