#!/usr/bin/env python3
import argparse
import json
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


# Publishes the extension to the Chrome Web Store through its v2 API. Credentials come
# from .env next to this file (git-ignored): CWS_CLIENT_ID, CWS_CLIENT_SECRET,
# CWS_REFRESH_TOKEN and CWS_PUBLISHER_ID, set up as described in
# https://developer.chrome.com/docs/webstore/using-api
#
#   python cws.py status     print the published and submitted versions
#   python cws.py publish    package extension/, upload it and submit it for review
#
# The API cannot edit the store listing; that stays in the Developer Dashboard.

ROOT = Path(__file__).resolve().parent
ENV_PATH = ROOT / ".env"
MANIFEST_PATH = ROOT / "extension" / "manifest.json"
DIST_DIR = ROOT / "dist"

EXTENSION_ID = "jdefobolefeekjbgaclabbcffmebamdo"
API = "https://chromewebstore.googleapis.com"
KEYS = ("CWS_CLIENT_ID", "CWS_CLIENT_SECRET", "CWS_REFRESH_TOKEN", "CWS_PUBLISHER_ID")


def load_credentials() -> dict[str, str]:
    values = {}
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
            key, sep, value = line.partition("=")
            if sep and not key.strip().startswith("#"):
                values[key.strip()] = value.strip().strip("\"'")
    missing = [key for key in KEYS if not values.get(key)]
    if missing:
        sys.exit(f"Fill {', '.join(missing)} in {ENV_PATH}")
    return values


def call(req: urllib.request.Request) -> dict:
    try:
        with urllib.request.urlopen(req) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        sys.exit(f"{req.get_method()} {req.full_url} failed: HTTP {error.code} {error.read().decode(errors='replace')}")


def access_token(credentials: dict[str, str]) -> str:
    body = urllib.parse.urlencode({
        "client_id": credentials["CWS_CLIENT_ID"],
        "client_secret": credentials["CWS_CLIENT_SECRET"],
        "refresh_token": credentials["CWS_REFRESH_TOKEN"],
        "grant_type": "refresh_token",
    }).encode()
    return call(urllib.request.Request("https://oauth2.googleapis.com/token", data=body))["access_token"]


def item_request(credentials: dict[str, str], token: str, action: str, method: str,
                 data: bytes | None = None, upload: bool = False) -> dict:
    prefix = "/upload" if upload else ""
    url = f"{API}{prefix}/v2/publishers/{credentials['CWS_PUBLISHER_ID']}/items/{EXTENSION_ID}:{action}"
    headers = {"Authorization": f"Bearer {token}"}
    if upload:
        headers["Content-Type"] = "application/zip"
    return call(urllib.request.Request(url, data=data, method=method, headers=headers))


def describe(revision: dict | None) -> str:
    if not revision:
        return "none"
    versions = ", ".join(channel.get("crxVersion", "?") for channel in revision.get("distributionChannels", []))
    return f"{versions or '?'} ({revision.get('state')})"


def status(credentials: dict[str, str], token: str) -> None:
    result = item_request(credentials, token, "fetchStatus", "GET")
    print(f"published: {describe(result.get('publishedItemRevisionStatus'))}")
    print(f"submitted: {describe(result.get('submittedItemRevisionStatus'))}")
    if "lastAsyncUploadState" in result:
        print(f"last upload: {result['lastAsyncUploadState']}")


def publish(credentials: dict[str, str], token: str) -> None:
    # package-extension.py checks that the manifest, userscript and .meta.js versions agree
    # before building the zip, so a mismatched release never reaches the store.
    subprocess.run([sys.executable, str(ROOT / "package-extension.py")], check=True)
    version = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))["version"]
    zip_path = DIST_DIR / f"strava-feed-filters-{version}.zip"

    result = item_request(credentials, token, "upload", "POST", zip_path.read_bytes(), upload=True)
    state = result.get("uploadState")
    # Large packages are processed asynchronously; fetchStatus reports when they finish.
    while state == "IN_PROGRESS":
        time.sleep(5)
        state = item_request(credentials, token, "fetchStatus", "GET").get("lastAsyncUploadState")
    if state != "SUCCEEDED":
        sys.exit(f"Upload of {version} ended in {state}: {json.dumps(result)}")
    print(f"Uploaded {version}")

    item_request(credentials, token, "publish", "POST", b"")
    print(f"Submitted {version} for review")
    status(credentials, token)


def main() -> None:
    parser = argparse.ArgumentParser(description="Publish the extension to the Chrome Web Store.")
    parser.add_argument("command", choices=["status", "publish"])
    args = parser.parse_args()
    credentials = load_credentials()
    token = access_token(credentials)
    {"status": status, "publish": publish}[args.command](credentials, token)


if __name__ == "__main__":
    main()
