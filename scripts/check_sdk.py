"""Check that the frontend calls the API through the generated SDK.

Separate from `api:check`: that task checks artifact freshness, while this one
checks that the app actually uses the generated client instead of raw requests
and hand-written copies.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "frontend" / "src"
SCHEMA = SRC / "api" / "schema.d.ts"
API = SRC / "lib" / "api.ts"


def main() -> int:
    errors: list[str] = []

    if not SCHEMA.is_file():
        errors.append("missing generated frontend/src/api/schema.d.ts")
    else:
        schema = SCHEMA.read_text(encoding="utf-8")
        if "export interface paths" not in schema:
            errors.append("schema.d.ts has no generated paths interface")

    if not API.is_file():
        errors.append("missing frontend/src/lib/api.ts")
    else:
        api = API.read_text(encoding="utf-8")
        for fragment in (
            "import type { paths } from '@/api/schema'",
            "createClient<paths>",
        ):
            if fragment not in api:
                errors.append(f"api.ts does not use the generated client: {fragment}")

    for path in sorted(SRC.rglob("*")):
        if path.suffix not in {".ts", ".tsx"} or path == API:
            continue
        text = path.read_text(encoding="utf-8")
        if "fetch(" in text:
            relative = path.relative_to(ROOT)
            errors.append(f"{relative}: raw fetch instead of apiClient")

    if errors:
        print("sdk:check: frontend bypasses the generated SDK", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1

    print("sdk:check: frontend uses the generated SDK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
