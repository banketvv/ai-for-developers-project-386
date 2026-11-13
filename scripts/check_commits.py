"""Check commit messages against the repository rules.

Used by the `.githooks/commit-msg` hook and CI. Standard library only, so it
runs the same on Windows and Linux.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

COMMIT_TYPES = (
    "build",
    "chore",
    "ci",
    "docs",
    "feat",
    "fix",
    "perf",
    "refactor",
    "revert",
    "style",
    "test",
)

HEADER_RE = re.compile(
    r"^(?P<type>" + "|".join(COMMIT_TYPES) + r")"
    r"(?:\((?P<scope>[a-z0-9._-]+)\))?"
    r"(?P<breaking>!)?: "
    r"(?P<description>.+)$"
)
TICKET_RE = re.compile(r" \(#(?P<number>\d+)\)$")
SKIP_PREFIXES = ("Merge ", 'Revert "', "chore(main): release ")

MAX_HEADER_LENGTH = 120
MAX_BODY_LINE_LENGTH = 100


def validate(message: str, *, require_ticket: bool) -> list[str]:
    """Возвращает список ошибок в одном сообщении коммита."""
    lines = message.lstrip("\ufeff").rstrip("\n").splitlines()
    if not lines or not lines[0].strip():
        return ["empty commit message"]

    subject = lines[0].rstrip()
    if subject.startswith(SKIP_PREFIXES):
        return []

    errors: list[str] = []
    if len(subject) > MAX_HEADER_LENGTH:
        errors.append(
            f"header is longer than {MAX_HEADER_LENGTH} characters ({len(subject)})"
        )

    header = subject
    ticket = TICKET_RE.search(header)
    if require_ticket:
        if ticket is None:
            errors.append("header must end with a ticket reference, e.g. (#15)")
        else:
            header = header[: ticket.start()]

    if HEADER_RE.fullmatch(header) is None:
        errors.append(
            "header does not match Conventional Commits: "
            "type(scope)?: description (#N)"
        )

    for index, line in enumerate(lines[1:], start=2):
        if len(line) > MAX_BODY_LINE_LENGTH:
            errors.append(
                f"line {index} is longer than {MAX_BODY_LINE_LENGTH} characters ({len(line)})"
            )

    return errors


def _git(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )


def default_range() -> str:
    """Выбирает диапазон коммитов ветки относительно основной ветки."""
    for base in ("origin/main", "main"):
        result = _git("rev-parse", "--verify", "--quiet", base)
        if result.returncode == 0:
            return f"{base}..HEAD"

    result = _git("rev-parse", "--verify", "--quiet", "HEAD~1")
    return "HEAD~1..HEAD" if result.returncode == 0 else "HEAD"


def commits_in_range(rev_range: str) -> list[tuple[str, str]]:
    """Возвращает пары (sha, сообщение) для коммитов диапазона."""
    result = _git("log", "--format=%H%x1f%B%x1e", rev_range)
    if result.returncode != 0:
        print(result.stderr.strip() or f"git log failed: {rev_range}", file=sys.stderr)
        raise SystemExit(2)

    commits: list[tuple[str, str]] = []
    for record in result.stdout.split("\x1e"):
        if not record.strip():
            continue
        sha, _, body = record.partition("\x1f")
        commits.append((sha.strip(), body.strip("\n")))
    return commits


def report(label: str, message: str, errors: list[str]) -> None:
    print(f"commit-msg: {label}", file=sys.stderr)
    for error in errors:
        print(f"  - {error}", file=sys.stderr)
    print(f"  message: {message.splitlines()[0] if message else ''}", file=sys.stderr)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--range", dest="rev_range", help="git range, e.g. origin/main..HEAD")
    source.add_argument("--message", help="check one message (for example, a PR title)")
    source.add_argument("--message-file", type=Path, help="file with a commit message")
    parser.add_argument(
        "--no-ticket",
        action="store_true",
        help="do not require a ticket reference (main branch and PR titles)",
    )
    args = parser.parse_args()

    if args.message_file is not None:
        message = args.message_file.read_text(
            encoding="utf-8", errors="replace"
        ).lstrip("\ufeff")
        errors = validate(message, require_ticket=not args.no_ticket)
        if errors:
            report(str(args.message_file), message, errors)
            return 1
        print("commit-msg: message is valid")
        return 0

    if args.message is not None:
        message = args.message.lstrip("\ufeff")
        errors = validate(message, require_ticket=not args.no_ticket)
        if errors:
            report("message", message, errors)
            return 1
        print("commit-msg: message is valid")
        return 0

    rev_range = args.rev_range or default_range()
    commits = commits_in_range(rev_range)
    failures = 0
    checked = 0
    for sha, message in commits:
        if message.startswith(SKIP_PREFIXES):
            continue
        checked += 1
        errors = validate(message, require_ticket=not args.no_ticket)
        if errors:
            failures += 1
            report(f"{sha[:12]}", message, errors)

    if failures:
        print(f"commit-msg: {failures} of {checked} commits failed", file=sys.stderr)
        return 1

    print(f"commit-msg: checked {checked} commits ({rev_range})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
