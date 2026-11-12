"""Helpers for end-to-end tests in a real Firefox (stdlib only).

Needs Firefox and geckodriver already installed (the Firefox snap ships `firefox.geckodriver`).
Nothing is installed by these scripts: the extension is loaded as a *temporary* add-on in a
throw-away headless session and removed when the session closes.
"""
import base64
import functools
import http.server
import json
import pathlib
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
EXT_ID = "video-speed-skip@talissonlima.github.io"
EXT_UUID = "7a1c0b5e-3f4d-4c3b-9a1e-0d2b7f6c8e11"
GD_PORT = 4466
HTTP_PORT = 8780
SITE = f"http://localhost:{HTTP_PORT}/tests"
EXT = f"moz-extension://{EXT_UUID}"


def find_geckodriver():
    path = shutil.which("geckodriver") or ("/snap/bin/geckodriver" if pathlib.Path("/snap/bin/geckodriver").exists() else None)
    if not path:
        raise SystemExit("geckodriver not found. It ships with the Firefox snap (firefox.geckodriver); nothing was installed.")
    return path


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def start_static_server():
    handler = functools.partial(QuietHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", HTTP_PORT), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def prepare_extension():
    """Build, then copy dist/firefox to a temp dir under $HOME (the snap can't read /tmp) and expose
    the extension pages to web pages (TEST COPY ONLY) so they can be loaded in an iframe."""
    subprocess.run(["python3", str(ROOT / "scripts" / "build.py")], check=True, stdout=subprocess.DEVNULL)
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="vss-e2e-", dir=pathlib.Path.home()))
    ext = tmp / "ext"
    shutil.copytree(ROOT / "dist" / "firefox", ext)
    manifest = json.loads((ext / "manifest.json").read_text())
    manifest["web_accessible_resources"] = [{"resources": ["*"], "matches": ["<all_urls>"]}]
    (ext / "manifest.json").write_text(json.dumps(manifest, indent=2))
    return tmp, ext


def call(method, path, body=None):
    data = None if method == "GET" else json.dumps(body if body is not None else {}).encode()
    req = urllib.request.Request(f"http://127.0.0.1:{GD_PORT}{path}", data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read() or b"{}").get("value")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {path}: {e.read().decode()[:300]}")


class Firefox:
    def __init__(self, dark=False, language="en-US"):
        self.gd = subprocess.Popen([find_geckodriver(), "--port", str(GD_PORT)],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(60):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{GD_PORT}/status", timeout=1)
                break
            except Exception:
                time.sleep(0.2)
        prefs = {
            "extensions.webextensions.uuids": json.dumps({EXT_ID: EXT_UUID}),
            "media.autoplay.default": 0,
            "media.autoplay.blocking_policy": 0,
            "browser.shell.checkDefaultBrowser": False,
            "datareporting.policy.dataSubmissionEnabled": False,
            "ui.systemUsesDarkTheme": 1 if dark else 0,
            "intl.accept_languages": language,
        }
        caps = {"capabilities": {"alwaysMatch": {"browserName": "firefox",
                "moz:firefoxOptions": {"args": ["-headless"], "prefs": prefs}}}}
        self.sid = call("POST", "/session", caps)["sessionId"]

    def p(self, path):
        return f"/session/{self.sid}{path}"

    def install(self, path):
        return call("POST", self.p("/moz/addon/install"), {"path": str(path), "temporary": True})

    def go(self, url):
        call("POST", self.p("/url"), {"url": url})

    def size(self, w, h):
        call("POST", self.p("/window/rect"), {"width": w, "height": h})

    def frame(self, index):
        call("POST", self.p("/frame"), {"id": index})

    def run(self, js):
        """Run an async function body in the page; it may `await` and must `return` JSON-able data."""
        script = ("const done = arguments[arguments.length - 1];"
                  "(async () => {" + js + "})().then(done, e => done({__error: String(e && e.stack || e)}));")
        result = call("POST", self.p("/execute/async"), {"script": script, "args": []})
        if isinstance(result, dict) and "__error" in result:
            raise RuntimeError(result["__error"])
        return result

    def press(self, key):
        """A REAL (trusted) key press through WebDriver actions, e.g. press("\ue007") for Enter."""
        call("POST", self.p("/actions"), {"actions": [{"type": "key", "id": "keyboard", "actions": [
            {"type": "keyDown", "value": key}, {"type": "keyUp", "value": key}]}]})

    def shot(self, path):
        pathlib.Path(path).write_bytes(base64.b64decode(call("GET", self.p("/screenshot"))))

    def shot_element(self, selector, path):
        element = call("POST", self.p("/element"), {"using": "css selector", "value": selector})
        element_id = next(iter(element.values()))
        pathlib.Path(path).write_bytes(base64.b64decode(call("GET", self.p(f"/element/{element_id}/screenshot"))))

    def open_ext(self, page, w=1100, h=800):
        """Open an extension page inside the frame-host page and switch into the frame."""
        self.size(w, h)
        self.go(f"{SITE}/frame-host.html?{EXT}/{page}")
        time.sleep(1.2)
        self.frame(0)

    def ext_run(self, js, page="options/options.html"):
        self.open_ext(page)
        try:
            return self.run(js)
        finally:
            self.frame(None)

    def quit(self):
        for fn in (lambda: call("DELETE", self.p("")), self.gd.terminate):
            try:
                fn()
            except Exception:
                pass
