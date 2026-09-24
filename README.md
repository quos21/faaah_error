# faaah_error
Makes Faaah(and a few other) sounds on error
# Error Sound Alert

Plays a sound whenever your code errors:

1. **On save** — if the saved file has an Error-severity diagnostic (works for any
   language with a linter/language server: Python via Pylance/Pyright, ESLint, etc.)
2. **On running a file** — if the terminal command you ran (e.g. `python app.py`)
   prints something matching an error pattern.
3. **On a long-running process** (e.g. `uvicorn main:app --reload`) — the terminal
   output is streamed live, so if an error appears at *any point* while the server
   keeps running, the sound plays immediately (no need to wait for it to exit).

Cases 2 and 3 use the same mechanism: VS Code's **Terminal Shell Integration** API
streams live output from any terminal command, so "run a file" and "long-running
server" are really the same code path — a regex check against each new line of
output.

## Setup (development / local use)

```bash
npm install
npm run compile
```

Then in VS Code: `F5` (Run Extension) to launch an Extension Development Host with
it loaded, or package it for real installation:

```bash
npm install -g @vscode/vsce
vsce package
code --install-extension error-sound-alert-0.1.0.vsix
```

That's the entire setup — no external services, no API keys, nothing to configure
to get started. Defaults are on out of the box.

## Requirements

- VS Code 1.93+ (for the Terminal Shell Integration streaming API)
- **Shell integration must be enabled** in VS Code (it is by default) and your
  shell must support it (bash, zsh, pwsh, fish — most default setups already work).
  You can check: run a command in the integrated terminal; if VS Code shows a
  colored bar/mark next to the command in the terminal, shell integration is active.
- Linux only: `paplay` (pulseaudio-utils) or `aplay` (alsa-utils) — one of these is
  present on almost every desktop Linux install already. macOS uses built-in
  `afplay`; Windows uses built-in PowerShell `Media.SoundPlayer`. No extra
  installs needed on Mac/Windows.

## Settings

| Setting | Default | Description |
|---|---|---|
| `errorSound.enabled` | `true` | Master on/off switch |
| `errorSound.sound` | `faaah` | `classic-beep` \| `descending-error` \| `buzzer` \| `alarm` \| `faaah` \| `custom` |
| `errorSound.customSoundPath` | `""` | Path to your own `.wav`/`.mp3` when `sound` is `custom` |
| `errorSound.onSave` | `true` | Play on save-with-error |
| `errorSound.onTerminalOutput` | `true` | Play on matching terminal output (run/uvicorn/etc.) |
| `errorSound.errorPatterns` | Python-ish defaults | Regexes checked against each terminal output line |
| `errorSound.cooldownMs` | `3000` | Minimum gap between two plays, to avoid spam |

Command palette:
- **Error Sound: Choose Sound** — quick-pick a bundled sound or browse a custom file, with instant preview
- **Error Sound: Play Test Sound**
- **Error Sound: Toggle Enabled**

## Bundled sounds

All 5 bundled sounds (including `faaah`) are synthesized tones generated
programmatically (`gen_sounds.py`) — no copyrighted audio, so they're safe to
ship and redistribute freely. Swap in your own with `custom` + `customSoundPath`.

## Extending beyond Python

Nothing here is Python-specific:
- The save-watcher uses VS Code's generic `Diagnostic` API, so it works for any
  language extension that reports errors (JS/TS via ESLint, Go, Rust, etc.) with
  zero changes.
- The terminal-watcher just regex-matches text, so add patterns for other
  ecosystems' error formats to `errorSound.errorPatterns` (e.g. add
  `"error TS\\d+:"` for TypeScript, `"panic:"` for Go, `"NullPointerException"`
  for Java) — no code changes needed, just settings.

## Known limitation

If shell integration isn't active for a terminal (some remote/SSH or exotic shell
setups), the terminal-based detection (cases 2 & 3) won't fire for that terminal,
though save-detection (case 1) still works. The extension logs this to its
"Error Sound Alert" output channel.