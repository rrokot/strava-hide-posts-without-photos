#!/usr/bin/env python3
import json
import re
import sys
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent
EXTENSION_DIR = ROOT / "extension"
MANIFEST_PATH = EXTENSION_DIR / "manifest.json"
USER_SCRIPT_PATH = ROOT / "strava-photo-filter-toggle.user.js"
CONTENT_PATH = EXTENSION_DIR / "content.js"
DIST_DIR = ROOT / "dist"


def assert_valid(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def strip_userscript_metadata(source: str) -> str:
    content = re.sub(
        r"(?s)^// ==UserScript==.*?// ==/UserScript==\r?\n\r?\n",
        "",
        source,
        count=1,
    )
    if content == source:
        raise RuntimeError("Could not strip userscript metadata from strava-photo-filter-toggle.user.js")
    return content


def zip_extension(zip_path: Path) -> None:
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for file_path in sorted(EXTENSION_DIR.iterdir()):
            if file_path.is_file():
                archive.write(file_path, file_path.name)


def main() -> int:
    assert_valid(MANIFEST_PATH.exists(), "extension/manifest.json is missing")

    CONTENT_PATH.write_bytes(
        strip_userscript_metadata(USER_SCRIPT_PATH.read_text(encoding="utf-8")).encode("utf-8")
    )

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    assert_valid(manifest.get("manifest_version") == 3, "manifest_version must be 3")
    assert_valid(manifest.get("version"), "manifest version is missing")

    for size in ("16", "48", "64", "128"):
        icon_path = manifest.get("icons", {}).get(size)
        assert_valid(icon_path, f"manifest icon {size} is missing")
        assert_valid((EXTENSION_DIR / icon_path).exists(), f"icon file {icon_path} is missing")

    zip_path = DIST_DIR / f"strava-feed-filters-{manifest['version']}.zip"

    DIST_DIR.mkdir(exist_ok=True)
    if zip_path.exists():
        zip_path.unlink()

    zip_extension(zip_path)
    print(zip_path)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(error, file=sys.stderr)
        raise SystemExit(1)
