#!/usr/bin/env python3
import argparse
import base64
import hashlib
import hmac
import json
import os
import secrets
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


# Manages the Firefox Add-ons (AMO) listing from the command line. Credentials come from
# .env next to this file (git-ignored): AMO_JWT_ISSUER and AMO_JWT_SECRET, created at
# https://addons.mozilla.org/en-US/developers/addon/api/key/
#
#   python amo.py show         print the listing's version and links
#   python amo.py set-links    point homepage and support URL at the GitHub repository
#   python amo.py sign         submit extension/ as a new listed version via web-ext

ROOT = Path(__file__).resolve().parent
ENV_PATH = ROOT / ".env"
EXTENSION_DIR = ROOT / "extension"

ADDON = "strava-feed-filters"
API = f"https://addons.mozilla.org/api/v5/addons/addon/{ADDON}/"
REPOSITORY = "https://github.com/rrokot/strava-feed-filters"
LOCALE = "en-US"


def load_credentials() -> tuple[str, str]:
    values = {}
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
            key, sep, value = line.partition("=")
            if sep and not key.strip().startswith("#"):
                values[key.strip()] = value.strip().strip("\"'")
    issuer = values.get("AMO_JWT_ISSUER") or os.environ.get("AMO_JWT_ISSUER")
    secret = values.get("AMO_JWT_SECRET") or os.environ.get("AMO_JWT_SECRET")
    if not issuer or not secret:
        sys.exit(f"Fill AMO_JWT_ISSUER and AMO_JWT_SECRET in {ENV_PATH}")
    return issuer, secret


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def make_token(issuer: str, secret: str) -> str:
    # AMO accepts HS256 tokens that expire at most five minutes after issue.
    now = int(time.time())
    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    claims = b64url(json.dumps({"iss": issuer, "jti": secrets.token_hex(16), "iat": now, "exp": now + 60}).encode())
    signature = hmac.new(secret.encode(), f"{header}.{claims}".encode(), hashlib.sha256).digest()
    return f"{header}.{claims}.{b64url(signature)}"


def request(method: str, credentials: tuple[str, str], body: dict | None = None) -> dict:
    req = urllib.request.Request(
        API,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "Authorization": f"JWT {make_token(*credentials)}",
            "Content-Type": "application/json",
            "User-Agent": "strava-feed-filters-amo/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        sys.exit(f"AMO {method} failed: HTTP {error.code} {error.read().decode(errors='replace')}")


def localized(field) -> str | None:
    # Read responses wrap translated URLs as {"url": {locale: ...}, "outgoing": ...}.
    if isinstance(field, dict):
        field = field.get("url", field)
    if isinstance(field, dict):
        return field.get(LOCALE) or next(iter(field.values()), None)
    return field


def show(credentials: tuple[str, str]) -> None:
    addon = request("GET", credentials)
    print(f"version:  {addon['current_version']['version']}")
    print(f"homepage: {localized(addon.get('homepage'))}")
    print(f"support:  {localized(addon.get('support_url'))}")


def set_links(credentials: tuple[str, str]) -> None:
    request("PATCH", credentials, {
        "homepage": {LOCALE: REPOSITORY},
        "support_url": {LOCALE: f"{REPOSITORY}/issues"},
    })
    show(credentials)


def sign(credentials: tuple[str, str]) -> None:
    npx = shutil.which("npx")
    if npx is None:
        sys.exit("npx not found; install Node.js")
    issuer, secret = credentials
    env = {**os.environ, "WEB_EXT_API_KEY": issuer, "WEB_EXT_API_SECRET": secret}
    command = [npx, "--yes", "web-ext", "sign", "--channel=listed",
               f"--source-dir={EXTENSION_DIR}", f"--artifacts-dir={ROOT / 'dist'}"]
    sys.exit(subprocess.call(command, env=env))


def main() -> None:
    parser = argparse.ArgumentParser(description="Manage the Firefox Add-ons listing.")
    parser.add_argument("command", choices=["show", "set-links", "sign"])
    args = parser.parse_args()
    credentials = load_credentials()
    {"show": show, "set-links": set_links, "sign": sign}[args.command](credentials)


if __name__ == "__main__":
    main()
