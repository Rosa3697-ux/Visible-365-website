"""Run with Python Playwright and Chromium. Provider calls use fictional fixtures."""
import os
import unittest
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1] / "GitHub/Visible-365-website"


class PortalTest(unittest.TestCase):
    def test_mobile_onboarding(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), partial(SimpleHTTPRequestHandler, directory=ROOT))
        Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH", "/usr/bin/chromium"))
            for language in ("en", "es"):
                with self.subTest(language=language):
                    self.check_customer(browser, server.server_port, language)
            browser.close()

    def check_customer(self, browser, port, language):
        page = browser.new_page(viewport={"width": 375, "height": 812})
        page.set_default_timeout(5000)
        page.on("pageerror", lambda error: print(error, flush=True))
        state = {"account": None, "order": None, "project": None, "requests": [], "admin": False}
        seen = []

        def provider(route):
            body = route.request.post_data_json or {}
            action = body.get("action") or route.request.url.split("/")[-1]
            seen.append(action)
            result = {}
            if action == "verify":
                result = {"access_token": "aaa.bbb.ccc", "refresh_token": "fictional"}
            elif action == "token?grant_type=refresh_token":
                result = {"access_token": "ddd.eee.fff", "refresh_token": "rotated"}
            elif action == "me":
                if seen.count("me") == 2:
                    route.fulfill(status=401, json={"error": "Session expired"})
                    return
                result = state
            elif action == "signup":
                assert body["language"] == language and body["industry"] == "Cleaning"
                state.update(account={"business_name": body["business"], "language": language, "intake_state": "draft", "intake_revision": 0}, order={"stage": "requested"}, project={"stage": "onboarding"})
            elif action == "intake_save":
                account = state["account"]
                assert body["revision"] == account["intake_revision"]
                account.update(intake_answers=body["answers"], intake_revision=body["revision"] + 1)
                if body["submit"]:
                    account.update(intake_state="submitted", intake_brief={"services": body["answers"]["services"]})
            route.fulfill(json=result)

        page.route("https://*.supabase.co/**", provider)
        page.goto(f"http://127.0.0.1:{port}/waas/")
        if language == "es":
            page.locator("#lang").click()
        page.locator('[name=email]').fill("fictional@example.invalid")
        page.locator('form button').click()
        page.locator('[name=code]').fill("12345678")
        page.locator('form button').click()
        page.locator('[name=business]').fill("Fictional Cleaning")
        page.locator('[name=industry]').fill("Cleaning")
        page.locator('form button').click()
        answers = {"service_area":"Austin","business_model":"mobile","audience":"Offices","services":"Cleaning","goal":"quotes","contact_method":"form","style":"modern","assets":"partial","domain_status":"need"}
        for step in range(5):
            page.locator("form[data-action=intake]").wait_for()
            page.get_by_text(f"{'Step' if language == 'en' else 'Paso'} {step+1} / 6", exact=True).wait_for()
            for name, value in answers.items():
                field = page.locator(f'[name="{name}"]')
                if field.count() and field.is_visible():
                    if field.evaluate("e=>e.tagName") == "SELECT":
                        field.select_option(value)
                    else:
                        field.fill(value)
            self.assertTrue(page.evaluate("document.documentElement.scrollWidth <= innerWidth"))
            page.locator('button[value=next]').click()
        page.locator('[name=confirm]').check()
        page.locator('button[value=submit]').click()
        page.get_by_text("Tu resumen está listo" if language=="es" else "Your brief is ready", exact=False).wait_for()
        page.reload()
        page.locator('[data-tab=intake]').first.click()
        self.assertEqual(state["account"]["intake_state"], "submitted")
        self.assertIn("token?grant_type=refresh_token", seen)
        self.assertEqual(seen.count("intake_save"), 6)
        page.locator("#logout").click()
        page.locator('[name=email]').wait_for()
        self.assertIsNone(page.evaluate("sessionStorage.getItem('visible365:sandbox:access:v1')"))
        page.close()


if __name__ == "__main__":
    unittest.main()
