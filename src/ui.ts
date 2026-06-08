import { spawnSync } from "child_process";
import type { Colors, Spinner } from "./types.ts";

export const useColor = (() => {
  const argv = process.argv;
  const colorFlag = argv.find(a => a.startsWith("--color="));
  if (colorFlag) {
    const val = colorFlag.split("=")[1];
    if (val === "never") return false;
    if (val === "always") return true;
  }
  if (argv.includes("--no-color")) return false;
  if (process.env.NO_COLOR !== undefined) return false;
  if (process.env.FORCE_COLOR !== undefined) return true;
  if (process.env.TERM === "dumb") return false;
  return process.stdout.isTTY === true;
})();

export const c: Colors = useColor
  ? { red: s => `\x1b[31m${s}\x1b[0m`, green: s => `\x1b[32m${s}\x1b[0m`,
      yellow: s => `\x1b[33m${s}\x1b[0m`, cyan: s => `\x1b[36m${s}\x1b[0m`,
      bold: s => `\x1b[1m${s}\x1b[0m`, dim: s => `\x1b[2m${s}\x1b[0m` }
  : { red: s => s, green: s => s, yellow: s => s, cyan: s => s, bold: s => s, dim: s => s };

export function die(msg: string, code = 1): never {
  const colored = msg
    .replace(/^(error:)/m, c.red("$1"))
    .replace(/^(  hint:)/m, c.dim("  hint:"));
  console.error(colored);
  process.exit(code);
}

export function usageError(msg: string): never {
  die(msg, 2);
}

export function info(msg: string): void {
  process.stderr.write(msg + "\n");
}

export function page(text: string): void {
  if (!text) return;
  if (!process.stdout.isTTY) { process.stdout.write(text); return; }
  const rows = process.stdout.rows || 24;
  if (text.split("\n").length <= rows) { process.stdout.write(text); return; }
  const pagerCmd = process.env.PAGER || "less -RFX";
  const parts = pagerCmd.split(/\s+/);
  spawnSync(parts[0], parts.slice(1), { input: text, stdio: ["pipe", "inherit", "inherit"] });
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function spinner(label = "Loading"): Spinner {
  if (!process.stderr.isTTY) return { stop() {} };
  let i = 0, stopped = false;
  const _write = process.stderr.write.bind(process.stderr);
  const id = setInterval(() => {
    _write(`\r${SPINNER_FRAMES[i++ % SPINNER_FRAMES.length]} ${label}`);
  }, 80);
  const stop = () => { if (stopped) return; stopped = true; clearInterval(id); _write("\r\x1b[K"); };
  const origWrite = process.stdout.write;
  process.stdout.write = function (this: typeof process.stdout, ...a: [any, ...any[]]) {
    stop();
    process.stdout.write = origWrite;
    return origWrite.apply(this, a as Parameters<typeof origWrite>);
  } as typeof process.stdout.write;
  return { stop };
}

export async function confirm(message: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const fs = await import("fs");
  process.stderr.write(`${message} [y/N] `);
  const buf = Buffer.alloc(64);
  const fd = fs.openSync("/dev/tty", "r");
  const n = fs.readSync(fd, buf);
  fs.closeSync(fd);
  return /^y(es)?$/i.test(buf.slice(0, n).toString().trim());
}
