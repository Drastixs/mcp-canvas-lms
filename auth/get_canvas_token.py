#!/usr/bin/env python3
"""
Canvas Mobile OAuth Token Generator

Mimics the Canvas Android app's OAuth flow to obtain a permanent
refresh token via Microsoft SSO + Duo MFA. Runs a headed Chromium
instance emulating a Pixel 7 on Android 16.

When called with environment variables CANVAS_CLIENT_ID, CANVAS_CLIENT_SECRET,
CANVAS_EMAIL, CANVAS_PASSWORD, and CANVAS_DOMAIN set, runs non-interactively
and outputs JSON to stdout. Otherwise, prompts interactively.

NOTE: You should only have to run this once. If you have any issues,
go to Settings > Access Tokens in your Canvas instance.
"""

import asyncio
import json
import os
import random
import sys
import getpass
from urllib.parse import urlparse, parse_qs

import requests
from playwright.async_api import async_playwright


# ── Config ───────────────────────────────────────────────────────
MOBILE_VERIFY_URL = "https://sso.canvaslms.com/api/v1/mobile_verify.json"
DEVICE_NAME = "Pixel_7"
REDIRECT_URI = "https://sso.canvaslms.com/canvas/login"

# Real Pixel 7 / Android 16 / Chrome 131 fingerprint
USER_AGENT = (
    "Mozilla/5.0 (Linux; Android 16; Pixel 7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.6778.200 Mobile Safari/537.36"
)
VIEWPORT = {"width": 412, "height": 915}
DEVICE_SCALE = 2.625


def log(msg):
    """Print to stderr so stdout stays clean for JSON output."""
    print(msg, file=sys.stderr, flush=True)


# ── Human-like helpers ───────────────────────────────────────────


async def human_type(page, selector, text):
    """Type each character with random delays, occasional micro-pauses."""
    el = page.locator(selector)
    await el.click()
    await asyncio.sleep(random.uniform(0.2, 0.5))
    for char in text:
        await el.type(char, delay=random.randint(45, 130))
        if random.random() < 0.07:
            await asyncio.sleep(random.uniform(0.2, 0.5))


async def pause(lo=1.0, hi=2.5):
    """Random pause between actions."""
    await asyncio.sleep(random.uniform(lo, hi))


# ── Main flow ────────────────────────────────────────────────────


async def main():
    # Determine input mode: env vars (non-interactive) or prompts
    canvas_domain = os.environ.get("CANVAS_DOMAIN")
    client_id = os.environ.get("CANVAS_CLIENT_ID")
    client_secret = os.environ.get("CANVAS_CLIENT_SECRET")
    email = os.environ.get("CANVAS_EMAIL")
    password = os.environ.get("CANVAS_PASSWORD")

    interactive = not all([canvas_domain, client_id, client_secret, email, password])

    if interactive:
        canvas_domain = canvas_domain or input(
            "Canvas domain (e.g. canvas.manchester.ac.uk): "
        )
        email = email or input("University email: ")
        password = password or getpass.getpass("Password: ")

    log("")
    log("=" * 60)
    log("  Canvas Mobile OAuth Token Generator")
    log("  You should only have to run this once.")
    log("  If you have any issues, go to Settings > Access Tokens")
    log("  in your Canvas instance.")
    log("=" * 60)

    # ── 1. Mobile verify (skip if credentials provided) ──────────
    if not client_id or not client_secret:
        log("\n[1/7] Fetching mobile app credentials from sso.canvaslms.com...")
        r = requests.get(
            MOBILE_VERIFY_URL,
            params={
                "domain": canvas_domain,
                "user_agent": "candroid/8.6.1 (289)",
            },
            headers={"User-Agent": "candroid/8.6.1 (289)"},
        )
        r.raise_for_status()
        mv = r.json()
        client_id = mv["client_id"]
        client_secret = mv["client_secret"]
        log(f"      client_id  = {client_id}")
        log(f"      base_url   = {mv['base_url']}")
    else:
        log("\n[1/7] Using provided client credentials.")

    # ── 2. Launch browser ────────────────────────────────────────
    log("[2/7] Launching Chromium (Pixel 7 emulation)...")
    auth_code = None
    code_event = asyncio.Event()

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--disable-features=AutomationControlled",
            ],
        )
        ctx = await browser.new_context(
            user_agent=USER_AGENT,
            viewport=VIEWPORT,
            device_scale_factor=DEVICE_SCALE,
            is_mobile=True,
            has_touch=True,
            locale="en-GB",
            timezone_id="Europe/London",
        )
        # Hide automation flags
        await ctx.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
            Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3]});
            Object.defineProperty(navigator, 'languages', {get: () => ['en-GB', 'en']});
            window.chrome = { runtime: {} };
        """)

        page = await ctx.new_page()

        # Intercept the redirect that carries the authorization code
        def on_request(request):
            nonlocal auth_code
            url = request.url
            if "sso.canvaslms.com/canvas/login" in url and "code=" in url:
                params = parse_qs(urlparse(url).query)
                code = params.get("code", [None])[0]
                if code and not code_event.is_set():
                    auth_code = code
                    code_event.set()

        page.on("request", on_request)

        # ── 3. Start OAuth flow ──────────────────────────────────
        log("[3/7] Starting mobile OAuth flow...")
        oauth_url = (
            f"https://{canvas_domain}/login/oauth2/auth"
            f"?client_id={client_id}"
            f"&response_type=code"
            f"&mobile=1"
            f"&purpose={DEVICE_NAME}"
            f"&redirect_uri={REDIRECT_URI}"
            f"&authentication_provider=saml"
        )
        await page.goto(oauth_url)

        # ── 4. Microsoft: email ──────────────────────────────────
        log("[4/7] Waiting for Microsoft login...")
        email_input = page.locator('input[type="email"], input[name="loginfmt"]')
        await email_input.wait_for(state="visible", timeout=30000)
        await pause(1.0, 2.0)

        log("      Typing email...")
        await human_type(page, 'input[type="email"], input[name="loginfmt"]', email)
        await pause(0.4, 1.0)

        submit = page.locator('input[type="submit"], button[type="submit"]')
        await submit.click()

        # ── 5. Microsoft: password ───────────────────────────────
        log("[5/7] Waiting for password field...")
        pw_input = page.locator('input[type="password"]:visible')
        await pw_input.wait_for(state="visible", timeout=15000)
        await pause(1.2, 2.5)

        log("      Typing password...")
        await human_type(page, 'input[type="password"]', password)
        await pause(0.4, 1.0)

        submit = page.locator('input[type="submit"], button[type="submit"]')
        await submit.click()

        # Handle "Stay signed in?" prompt if it appears
        try:
            no_btn = page.locator('input[value="No"], button:has-text("No")')
            await no_btn.wait_for(state="visible", timeout=5000)
            await pause(0.5, 1.2)
            await no_btn.click()
        except Exception:
            pass

        # ── 6. Duo MFA ───────────────────────────────────────────
        log("[6/7] Waiting for Duo MFA — approve the push on your phone...")
        log("      (timeout: 2 minutes)")

        try:
            await asyncio.wait_for(code_event.wait(), timeout=120)
        except asyncio.TimeoutError:
            log("\nERROR: Timed out waiting for Duo approval.")
            await browser.close()
            sys.exit(1)

        log(f"      Auth code captured: {auth_code[:20]}...")
        await browser.close()

    # ── 7. Exchange code for tokens ──────────────────────────────
    log("[7/7] Exchanging authorization code for tokens...")
    r = requests.post(
        f"https://{canvas_domain}/login/oauth2/token",
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "code": auth_code,
        },
    )

    if r.status_code != 200:
        log(f"\nERROR: Token exchange failed ({r.status_code})")
        log(r.text)
        sys.exit(1)

    token_data = r.json()

    # Output JSON to stdout for programmatic consumption
    result = {
        "access_token": token_data.get("access_token", ""),
        "refresh_token": token_data.get("refresh_token", ""),
        "user": token_data.get("user", {}),
        "canvas_region": token_data.get("canvas_region"),
        "token_type": token_data.get("token_type", "Bearer"),
    }

    print(json.dumps(result))

    # Also log human-readable summary to stderr
    user = token_data.get("user", {})
    log("\n" + "=" * 60)
    log("  Authentication successful!")
    log("=" * 60)
    log(f"  User: {user.get('name')} (ID: {user.get('id')})")
    log(f"  Region: {token_data.get('canvas_region')}")
    log("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
