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
    assert_valid(manifest.get("manifest_version") == 3, "manifest_version must be 3")
    assert_valid(manifest.get("version"), "manifest version is missing")

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
    assert_valid(
        script_version == manifest["version"],
        f"{USER_SCRIPT_PATH.name} @version {script_version} does not match manifest version {manifest['version']}",
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

    for size in ("16", "48", "64", "128"):
        icon_path = manifest.get("icons", {}).get(size)
        assert_valid(icon_path, f"manifest icon {size} is missing")
        assert_valid((EXTENSION_DIR / icon_path).exists(), f"icon file {icon_path} is missing")

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
