#!/usr/bin/env python3
"""
Apply Create Service Request–style overlay, shell, header/footer chrome to Create*.tsx modals.
Idempotent: skips lines already using CREATE_MODAL_OVERLAY / createModalShellClass.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src" / "components"
IMPORT_LINE = (
    "import {\n"
    "  CM_BTN_CANCEL,\n"
    "  CM_BTN_PRIMARY,\n"
    "  CREATE_MODAL_FOOTER_STICKY,\n"
    "  CREATE_MODAL_OVERLAY,\n"
    "  CREATE_MODAL_OVERLAY_STACK,\n"
    "  createModalShellClass,\n"
    "} from '../ui/CreateModalChrome'\n"
)

SKIP_FILES = frozenset({"CreateModalChrome.tsx", "CreateServiceRequestModal.tsx"})

OVERLAY_REPLACEMENTS: list[tuple[str, str]] = [
    (
        'className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"',
        "className={CREATE_MODAL_OVERLAY}",
    ),
    (
        'className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"',
        "className={CREATE_MODAL_OVERLAY}",
    ),
    (
        'className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"',
        "className={CREATE_MODAL_OVERLAY}",
    ),
    (
        'className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"',
        "className={CREATE_MODAL_OVERLAY}",
    ),
    (
        'className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"',
        "className={CREATE_MODAL_OVERLAY}",
    ),
    (
        'className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"',
        "className={CREATE_MODAL_OVERLAY}",
    ),
    (
        'className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"',
        "className={CREATE_MODAL_OVERLAY}",
    ),
    (
        'className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"',
        "className={CREATE_MODAL_OVERLAY}",
    ),
    (
        'className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]"',
        "className={CREATE_MODAL_OVERLAY_STACK}",
    ),
    (
        'className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]"',
        "className={CREATE_MODAL_OVERLAY_STACK}",
    ),
    (
        'className="fixed inset-0 bg-white/50 flex items-center justify-center z-50 p-4"',
        "className={CREATE_MODAL_OVERLAY}",
    ),
]

# className="..." on one line — standard white modal card → emerald shell
INNER_CLASS_RE = re.compile(
    r'className="(bg-white rounded-(?:lg|xl) shadow-(?:xl|2xl) )([^"]+)"'
)


def needs_chrome_import(text: str) -> bool:
    return "CREATE_MODAL_OVERLAY" in text or "createModalShellClass" in text


def add_import(text: str) -> str:
    if "@components/ui/CreateModalChrome" in text:
        return text
    lines = text.splitlines(keepends=True)
    insert_at = 0
    for i, line in enumerate(lines):
        if line.startswith("import ") and "from 'react'" in line:
            insert_at = i + 1
            break
    lines.insert(insert_at, "\n" + IMPORT_LINE)
    return "".join(lines)


def strip_inner_tail(tail: str) -> str:
    s = tail.replace("mx-4 ", "").replace("mx-4", "").strip()
    if s.endswith(" flex flex-col"):
        s = s[: -len(" flex flex-col")].strip()
    return s


def patch_inner_classnames(text: str) -> str:
    if "createModalShellClass(" in text:
        return text

    def repl(m: re.Match[str]) -> str:
        tail = m.group(2)
        if "dark:" in m.group(0):
            return m.group(0)
        parts = strip_inner_tail(tail)
        return f"className={{createModalShellClass('{parts}')}}"

    return INNER_CLASS_RE.sub(repl, text)


def patch_misc(text: str) -> str:
    # CreateMedicineGivenModal-style inner (no "shadow-xl" after rounded-xl — uses shadow-2xl with different order)
    text = re.sub(
        r'className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-\[90vh\] overflow-hidden flex flex-col"',
        "className={createModalShellClass('max-w-2xl max-h-[90vh] overflow-hidden')}",
        text,
    )
    # Footer bars
    text = text.replace(
        'className="border-t border-slate-200 bg-white px-5 py-4 flex items-center justify-between gap-3 flex-shrink-0"',
        'className={`${CREATE_MODAL_FOOTER_STICKY} items-center justify-between gap-3`}',
    )
    text = text.replace(
        'className="border-t border-slate-200 bg-white px-5 py-4 flex items-center justify-between gap-3 flex-shrink-0"',
        'className={`${CREATE_MODAL_FOOTER_STICKY} items-center justify-between gap-3`}',
    )
    text = text.replace(
        'className="shrink-0 flex justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-white rounded-b-lg"',
        'className={`${CREATE_MODAL_FOOTER_STICKY} justify-end gap-3`}',
    )
    text = text.replace(
        'className="shrink-0 border-t border-slate-200 px-6 py-4 flex items-center justify-between bg-white rounded-b-lg"',
        'className={`${CREATE_MODAL_FOOTER_STICKY} items-center justify-between`}',
    )
    # Common modal headers → emerald gradient (no radial — keeps one-line change safe)
    text = text.replace(
        'className="px-5 py-4 border-b border-slate-200 flex-shrink-0 flex items-center justify-between"',
        'className="relative shrink-0 border-b border-emerald-100/60 bg-gradient-to-r from-emerald-100 via-teal-50 to-sky-100 px-5 py-4 sm:px-6 flex flex-shrink-0 items-center justify-between"',
    )
    text = text.replace(
        'className="px-5 py-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0"',
        'className="relative shrink-0 border-b border-emerald-100/60 bg-gradient-to-r from-emerald-100 via-teal-50 to-sky-100 px-5 py-4 sm:px-6 flex flex-shrink-0 items-center justify-between"',
    )
    text = text.replace(
        'className="p-4 border-b border-slate-200 flex-shrink-0"',
        'className="relative shrink-0 border-b border-emerald-100/60 bg-gradient-to-r from-emerald-100 via-teal-50 to-sky-100 p-4 sm:px-5 flex-shrink-0"',
    )
    text = text.replace(
        'className="px-6 py-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0"',
        'className="relative shrink-0 border-b border-emerald-100/60 bg-gradient-to-r from-emerald-100 via-teal-50 to-sky-100 px-6 py-4 flex flex-shrink-0 items-center justify-between"',
    )
    # Titles in modal headers
    text = text.replace(
        'className="text-xl font-semibold text-slate-900"',
        'className="text-lg font-semibold tracking-tight text-emerald-950"',
    )
    text = text.replace(
        'className="text-lg font-semibold text-slate-900"',
        'className="text-lg font-semibold tracking-tight text-emerald-950"',
    )
    # Default close button in headers
    text = text.replace(
        'className="text-slate-400 hover:text-slate-600"',
        'className="shrink-0 rounded-lg p-2 text-emerald-800/70 transition hover:bg-emerald-200/50 hover:text-emerald-950"',
    )
    text = text.replace(
        "className='text-slate-400 hover:text-slate-600'",
        'className="shrink-0 rounded-lg p-2 text-emerald-800/70 transition hover:bg-emerald-200/50 hover:text-emerald-950"',
    )
    # Footer buttons (common Create modal pair)
    text = text.replace(
        'className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"',
        "className={CM_BTN_CANCEL}",
    )
    text = text.replace(
        'className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"',
        "className={CM_BTN_PRIMARY}",
    )
    text = text.replace(
        'className="px-6 py-2 bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"',
        "className={CM_BTN_PRIMARY}",
    )
    return text


def patch_multiline_overlay(text: str) -> str:
    """className on its own line inside opening <div."""

    def repl(m: re.Match[str]) -> str:
        cls = m.group(1)
        if "CREATE_MODAL_OVERLAY" in cls:
            return m.group(0)
        if "bg-black" not in cls and "bg-white/50" not in cls:
            return m.group(0)
        if "fixed inset-0" not in cls:
            return m.group(0)
        inner = "CREATE_MODAL_OVERLAY_STACK" if "z-[60]" in cls or "z-[70]" in cls else "CREATE_MODAL_OVERLAY"
        indent = m.group(0).split("className")[0]
        return f"{indent}className={{{inner}}}"

    return re.sub(
        r'^(\s*)className="(fixed inset-0[^"]*)"\s*$',
        repl,
        text,
        flags=re.MULTILINE,
    )


def process_file(path: Path) -> bool:
    if path.name in SKIP_FILES:
        return False
    raw = path.read_text(encoding="utf-8")
    if not raw.startswith("import ") and "import " not in raw[:800]:
        return False
    before = raw
    text = raw
    for old, new in OVERLAY_REPLACEMENTS:
        text = text.replace(old, new)
    text = patch_multiline_overlay(text)
    text = patch_inner_classnames(text)
    text = patch_misc(text)

    if text == before:
        return False

    if needs_chrome_import(text) and "@components/ui/CreateModalChrome" not in text:
        text = add_import(text)

    path.write_text(text, encoding="utf-8")
    return True


def main() -> int:
    changed = []
    for p in sorted(ROOT.rglob("Create*.tsx")):
        if process_file(p):
            changed.append(p.relative_to(ROOT.parent.parent))
    for c in changed:
        print("updated", c)
    print(f"done, {len(changed)} files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
