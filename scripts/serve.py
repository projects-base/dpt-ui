"""
Dev server for the dashboard.

    python scripts/serve.py          # http://localhost:3000
    python scripts/serve.py 5500

`python -m http.server` sends Last-Modified and no Cache-Control, which lets
Chrome apply *heuristic* freshness: it guesses a lifetime from the file's age
and serves the cached copy without revalidating. On a project with no build
step that is genuinely painful — you edit a stylesheet or an ES module, reload,
and get the old one back with no indication anything is stale. It cost several
rounds of "why is my change not showing" during development, twice on CSS and
once on a module.

So this sends `Cache-Control: no-store` on everything. Slower than a real
cache, irrelevant over localhost, and it means reload always means reload.

Port 3000 is the default because that is the origin registered with Google
OAuth — signing in from any other port fails with redirect_uri_mismatch.
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PORT = 3000


class NoCacheHandler(SimpleHTTPRequestHandler):
    """Serves the site, and tells the browser to keep none of it."""

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # One line per request, without the date noise SimpleHTTPRequestHandler adds.
        sys.stderr.write("  %s\n" % (fmt % args))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    handler = partial(NoCacheHandler, directory=str(ROOT))
    with ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print(f"Dashboard  http://localhost:{port}/dashboard.html")
        print(f"Demo mode  http://localhost:{port}/dashboard.html?demo=1")
        print("Caching is off — a reload always fetches. Ctrl-C to stop.\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped")


if __name__ == "__main__":
    main()
