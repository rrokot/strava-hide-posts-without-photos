#!/usr/bin/env python3
import json
import re
import sys
import zipfile
from pathlib import Path


# Packages extension/ into a store-ready zip and regenerates content.js from the
# userscript. The checks here cover only what is specific to shipping one source as both
# a userscript and an extension; generic manifest validation (schema, icon files, AMO
# rules) is left to web-ext lint, which CI runs against extension/.

ROOT = Path(__file__).resolve().parent
EXTENSION_DIR = ROOT / "extension"
MANIFEST_PATH = EXTENSION_DIR / "manifest.json"
USER_SCRIPT_PATH = ROOT / "strava-photo-filter-toggle.user.js"
META_PATH = ROOT / "strava-photo-filter-toggle.meta.js"
CONTENT_PATH = EXTENSION_DIR / "content.js"
DIST_DIR = ROOT / "dist"

METADATA_BLOCK_PATTERN = re.compile(r"(?s)^// ==UserScript==.*?// ==/UserScript==")
VERSION_PATTERN = re.compile(r"^// @version\s+(\S+)\s*$", re.MULTILINE)


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


def read_metadata_block(source: str, origin: str) -> str:
    match = METADATA_BLOCK_PATTERN.search(source)
    assert_valid(match is not None, f"{origin} has no userscript metadata block")
    return match.group(0)


def read_version(metadata: str, origin: str) -> str:
    match = VERSION_PATTERN.search(metadata)
    assert_valid(match is not None, f"{origin} has no // @version line")
    return match.group(1)


def zip_extension(zip_path: Path) -> None:
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for file_path in sorted(EXTENSION_DIR.iterdir()):
            if file_path.is_file():
                archive.write(file_path, file_path.name)


def main() -> int:
    assert_valid(MANIFEST_PATH.exists(), "extension/manifest.json is missing")
    assert_valid(USER_SCRIPT_PATH.exists(), f"{USER_SCRIPT_PATH.name} is missing")
    assert_valid(META_PATH.exists(), f"{META_PATH.name} is missing")

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))

    # The version is carried by three files: the manifest, the userscript header, and the
    # .meta.js stub Tampermonkey polls for updates. Drift between them silently stops
    # userscript updates, so the stub has to stay a copy of the header.
    user_script_source = USER_SCRIPT_PATH.read_text(encoding="utf-8")
    metadata = read_metadata_block(user_script_source, USER_SCRIPT_PATH.name)
    assert_valid(
        META_PATH.read_text(encoding="utf-8").strip() == metadata.strip(),
        f"{META_PATH.name} is out of sync with the {USER_SCRIPT_PATH.name} metadata block",
    )
    script_version = read_version(metadata, USER_SCRIPT_PATH.name)
    manifest_version = manifest.get("version")
    assert_valid(
        script_version == manifest_version,
        f"{USER_SCRIPT_PATH.name} @version {script_version} does not match manifest version {manifest_version}",
    )

    # The userscript runs in the page context (@grant none), so the content script has to
    # as well: patching history.pushState from an isolated world would not see Strava's own
    # SPA navigations, and the two builds would drift apart in behaviour.
    content_scripts = manifest.get("content_scripts") or []
    assert_valid(bool(content_scripts), "manifest content_scripts is missing")
    assert_valid(
        all(entry.get("world") == "MAIN" for entry in content_scripts),
        "content scripts must declare \"world\": \"MAIN\" to match the userscript's page context",
    )

    assert_valid(
        manifest.get("browser_specific_settings", {}).get("gecko", {}).get("id"),
        "Firefox gecko id is missing",
    )
    assert_valid(
        manifest.get("browser_specific_settings", {})
        .get("gecko", {})
        .get("data_collection_permissions", {})
        .get("required")
        == ["none"],
        "Firefox data collection permissions must be ['none']",
    )
    assert_valid(
        manifest.get("browser_specific_settings", {}).get("gecko_android") == {},
        "Firefox Android support requires empty gecko_android settings",
    )

    CONTENT_PATH.write_bytes(strip_userscript_metadata(user_script_source).encode("utf-8"))

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
