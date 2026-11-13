"""Запускает `mise run check` и возвращает настоящий код выхода.

PowerShell 5.1 превращает stderr native-команд в `NativeCommandError`, из-за
чего успешный прогон может выглядеть упавшим. Этот скрипт перехватывает оба
потока и печатает только хвост лога, поэтому код выхода не искажается.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

TAIL_LINES = 80


def find_mise() -> str | None:
    """Ищет mise в PATH и в типичных местах установки."""
    for name in ("mise", "mise.exe"):
        found = shutil.which(name)
        if found:
            return found

    candidates: list[Path] = []
    local_app_data = Path.home() / "AppData" / "Local"
    winget = local_app_data / "Microsoft" / "WinGet" / "Packages"
    if winget.is_dir():
        candidates.extend(winget.glob("jdx.mise_*/mise/bin/mise.exe"))
    candidates.extend(
        [
            Path.home() / ".local" / "bin" / "mise",
            Path("/usr/local/bin/mise"),
            Path("/usr/bin/mise"),
        ]
    )
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    return None


def main() -> int:
    # Консоль Windows может быть в cp1251: не падаем на стрелках и эмодзи из логов.
    sys.stdout.reconfigure(errors="replace")
    sys.stderr.reconfigure(errors="replace")

    mise = find_mise()
    if mise is None:
        print(
            "check: mise not found. Install it or run `mise run check:agent`.",
            file=sys.stderr,
        )
        return 127

    root = Path(__file__).resolve().parent.parent
    print("check: running `mise run check`...", flush=True)
    process = subprocess.run(
        [mise, "run", "check"],
        cwd=root,
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )

    output = (process.stdout or "") + (process.stderr or "")
    lines = output.rstrip("\n").splitlines()
    for line in lines[-TAIL_LINES:]:
        print(line)
    if len(lines) > TAIL_LINES:
        print(f"... showing the last {TAIL_LINES} of {len(lines)} lines")

    status = "OK" if process.returncode == 0 else "FAILED"
    print(f"\ncheck: {status} (exit {process.returncode})")
    return process.returncode


if __name__ == "__main__":
    raise SystemExit(main())
