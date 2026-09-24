import * as vscode from "vscode";
import * as cp from "child_process";
import * as path from "path";

let lastPlayed = 0;
let outputChannel: vscode.OutputChannel;

const BUNDLED_SOUNDS = ["classic-beep", "descending-error", "buzzer", "alarm", "faaah"];

function getConfig() {
  return vscode.workspace.getConfiguration("errorSound");
}

function resolveSoundPath(context: vscode.ExtensionContext): string | undefined {
  const cfg = getConfig();
  const chosen = cfg.get<string>("sound", "faaah");
  if (chosen === "custom") {
    const custom = cfg.get<string>("customSoundPath", "");
    return custom && custom.trim().length > 0 ? custom : undefined;
  }
  return context.asAbsolutePath(path.join("media", `${chosen}.wav`));
}

function playSound(context: vscode.ExtensionContext, reason: string) {
  const cfg = getConfig();
  if (!cfg.get<boolean>("enabled", true)) return;

  const now = Date.now();
  const cooldown = cfg.get<number>("cooldownMs", 3000);
  if (now - lastPlayed < cooldown) return;
  lastPlayed = now;

  const soundPath = resolveSoundPath(context);
  if (!soundPath) {
    outputChannel.appendLine(`[errorSound] No sound file resolved (reason: ${reason})`);
    return;
  }

  outputChannel.appendLine(`[errorSound] Playing (${reason}): ${soundPath}`);

  const platform = process.platform;
  let cmd: string;
  let args: string[];

  if (platform === "darwin") {
    cmd = "afplay";
    args = [soundPath];
  } else if (platform === "win32") {
    cmd = "powershell";
    args = [
      "-NoProfile",
      "-Command",
      `(New-Object Media.SoundPlayer '${soundPath.replace(/'/g, "''")}').PlaySync();`
    ];
  } else {
    // Linux — try paplay, fall back to aplay
    cmd = "paplay";
    args = [soundPath];
  }

  const child = cp.spawn(cmd, args, { stdio: "ignore" });
  child.on("error", (err: Error) => {
    if (platform !== "darwin" && platform !== "win32") {
      // fallback for linux if paplay isn't installed
      const fallback = cp.spawn("aplay", [soundPath], { stdio: "ignore" });
      fallback.on("error", (e2: Error) => {
        outputChannel.appendLine(
          `[errorSound] Could not play sound. Install 'paplay' (pulseaudio-utils) or 'aplay' (alsa-utils). Error: ${e2.message}`
        );
      });
    } else {
      outputChannel.appendLine(`[errorSound] Could not play sound: ${err.message}`);
    }
  });
}

function compilePatterns(cfg: vscode.WorkspaceConfiguration): RegExp[] {
  const patterns = cfg.get<string[]>("errorPatterns", []);
  const out: RegExp[] = [];
  for (const p of patterns) {
    try {
      out.push(new RegExp(p));
    } catch {
      outputChannel.appendLine(`[errorSound] Invalid regex in errorPatterns: ${p}`);
    }
  }
  return out;
}

// ---------- 1. Save-with-error detection via diagnostics ----------
function registerSaveWatcher(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      const cfg = getConfig();
      if (!cfg.get<boolean>("onSave", true)) return;

      const diagnostics = vscode.languages.getDiagnostics(doc.uri);
      const hasError = diagnostics.some((d) => d.severity === vscode.DiagnosticSeverity.Error);
      if (hasError) {
        playSound(context, `save error in ${path.basename(doc.fileName)}`);
      }
    })
  );
}

// ---------- 2 & 3. Terminal run / long-running process (uvicorn) error detection ----------
// Uses VS Code's Terminal Shell Integration API: streams a command's live output
// so we can catch errors from short "run file" commands AND long-running
// servers (uvicorn) without waiting for the process to exit.
function registerTerminalWatcher(context: vscode.ExtensionContext) {
  // Guard: shell integration API may not exist on very old VS Code versions.
  if (!("onDidStartTerminalShellExecution" in vscode.window)) {
    outputChannel.appendLine(
      "[errorSound] Terminal Shell Integration API not available in this VS Code version; onTerminalOutput feature disabled."
    );
    return;
  }

  context.subscriptions.push(
    (vscode.window as any).onDidStartTerminalShellExecution(
      async (event: any) => {
        const cfg = getConfig();
        if (!cfg.get<boolean>("onTerminalOutput", true)) return;

        const patterns = compilePatterns(cfg);
        if (patterns.length === 0) return;

        try {
          const stream = event.execution.read();
          let buffer = "";
          for await (const chunk of stream) {
            buffer += chunk;
            let idx: number;
            // process complete lines as they arrive
            while ((idx = buffer.indexOf("\n")) !== -1) {
              const line = buffer.slice(0, idx);
              buffer = buffer.slice(idx + 1);
              if (patterns.some((re) => re.test(line))) {
                playSound(context, `terminal output matched error pattern`);
              }
            }
          }
          // check any trailing partial line too
          if (buffer && patterns.some((re) => re.test(buffer))) {
            playSound(context, `terminal output matched error pattern`);
          }
        } catch (err: any) {
          outputChannel.appendLine(`[errorSound] Terminal stream read error: ${err?.message ?? err}`);
        }
      }
    )
  );
}

// ---------- Commands ----------
function registerCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("errorSound.testSound", () => {
      playSound(context, "manual test");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("errorSound.pickSound", async () => {
      const cfg = getConfig();
      const items = [...BUNDLED_SOUNDS, "custom"];
      const pick = await vscode.window.showQuickPick(items, {
        placeHolder: "Choose the sound to play on error"
      });
      if (pick) {
        await cfg.update("sound", pick, vscode.ConfigurationTarget.Global);
        if (pick === "custom") {
          const uri = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: { Audio: ["wav", "mp3"] },
            openLabel: "Use this sound"
          });
          if (uri && uri[0]) {
            await cfg.update("customSoundPath", uri[0].fsPath, vscode.ConfigurationTarget.Global);
          }
        }
        playSound(context, "sound changed preview");
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("errorSound.toggleEnabled", async () => {
      const cfg = getConfig();
      const current = cfg.get<boolean>("enabled", true);
      await cfg.update("enabled", !current, vscode.ConfigurationTarget.Global);
      vscode.window.setStatusBarMessage(
        `Error Sound Alert: ${!current ? "enabled" : "disabled"}`,
        2000
      );
    })
  );
}

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel("Error Sound Alert");
  context.subscriptions.push(outputChannel);

  registerSaveWatcher(context);
  registerTerminalWatcher(context);
  registerCommands(context);

  outputChannel.appendLine("[errorSound] Activated.");
}

export function deactivate() {}