import wave, struct, math, os

OUT = "media"
os.makedirs(OUT, exist_ok=True)
RATE = 44100

def write_wav(name, samples):
    path = os.path.join(OUT, name)
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        frames = b"".join(struct.pack("<h", int(max(-1, min(1, s)) * 32000)) for s in samples)
        w.writeframes(frames)
    print("wrote", path)

def envelope(i, n, attack=0.02, release=0.15):
    t = i / n
    a = attack
    r = release
    if t < a:
        return t / a
    if t > 1 - r:
        return max(0.0, (1 - t) / r)
    return 1.0

def tone(freq, dur, wave_fn=math.sin, vol=0.6):
    n = int(RATE * dur)
    out = []
    for i in range(n):
        t = i / RATE
        s = wave_fn(2 * math.pi * freq * t) * vol * envelope(i, n)
        out.append(s)
    return out

def silence(dur):
    return [0.0] * int(RATE * dur)

def square(x):
    return 1.0 if math.sin(x) >= 0 else -1.0

# 1. "classic-beep" - simple double beep
s1 = tone(880, 0.12) + silence(0.06) + tone(880, 0.12)
write_wav("classic-beep.wav", s1)

# 2. "descending-error" - the classic "wah wah wah" sad trombone-ish descending tone
s2 = tone(500, 0.18) + tone(420, 0.18) + tone(340, 0.18) + tone(260, 0.30)
write_wav("descending-error.wav", s2)

# 3. "buzzer" - harsh square-wave buzz
s3 = tone(180, 0.35, wave_fn=square, vol=0.35)
write_wav("buzzer.wav", s3)

# 4. "alarm" - two-tone alternating alarm
seg = tone(700, 0.15) + tone(500, 0.15)
s4 = seg * 3
write_wav("alarm.wav", s4)

# 5. "faaah" - a sliding pitch-bend "FAAAAH" style groan (sweep down then vibrato)
n = int(RATE * 0.9)
out = []
for i in range(n):
    t = i / n
    freq = 300 - 180 * t + 15 * math.sin(2 * math.pi * 6 * t)
    ph = 2 * math.pi * freq * (i / RATE)
    out.append(math.sin(ph) * 0.6 * envelope(i, n, attack=0.05, release=0.25))
write_wav("faaah.wav", out)

print("done")