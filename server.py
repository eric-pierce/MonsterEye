#!/usr/bin/env python3
"""
Monster Eye server.

Serves the eye and the settings page, and stores settings in config.json so
you can change the animation loop from your phone while the display shows the eye.

    python3 server.py            # port 8000
    python3 server.py --port 8080

Only the Python standard library is used; nothing to install.
"""
import argparse
import errno
import json
import os
import socket
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(HERE, "config.json")
LOCK = threading.Lock()
PORT = 8000


def lan_urls(port):
    urls = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))  # no packets are sent
        ip = s.getsockname()[0]
        s.close()
        if not ip.startswith("127."):
            urls.append(f"http://{ip}:{port}")
    except OSError:
        pass
    host = socket.gethostname().split(".")[0]   # macOS may already append .local
    if host and host != "localhost":
        urls.append(f"http://{host}.local:{port}")
    return urls


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=HERE, **kwargs)

    def log_message(self, fmt, *args):  # keep the log quiet
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/config":
            with LOCK:
                try:
                    with open(CONFIG_PATH) as f:
                        return self._json(200, json.load(f))
                except (OSError, ValueError):
                    return self._json(200, {})
        if path == "/api/info":
            return self._json(200, {"urls": lan_urls(PORT)})
        if path in ("/config", "/config/", "/settings"):
            self.send_response(302)
            self.send_header("Location", "/config.html")
            self.end_headers()
            return
        return super().do_GET()

    def do_POST(self):
        if self.path.split("?", 1)[0] != "/api/config":
            return self._json(404, {"error": "not found"})
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > 200_000:
            return self._json(413, {"error": "bad size"})
        try:
            data = json.loads(self.rfile.read(length))
        except ValueError:
            return self._json(400, {"error": "invalid json"})
        if not isinstance(data, dict):
            return self._json(400, {"error": "expected an object"})
        with LOCK:
            tmp = CONFIG_PATH + ".tmp"
            with open(tmp, "w") as f:
                json.dump(data, f, indent=2)
            os.replace(tmp, CONFIG_PATH)
        return self._json(200, {"ok": True})


def main():
    global PORT
    ap = argparse.ArgumentParser(description="Monster Eye server")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--host", default="0.0.0.0", help="use 127.0.0.1 to block phone access")
    args = ap.parse_args()
    PORT = args.port
    try:
        srv = ThreadingHTTPServer((args.host, args.port), Handler)
    except OSError as e:
        if e.errno in (errno.EADDRINUSE, 48, 98):
            sys.exit(f"Port {args.port} is already in use. Try: python3 server.py --port {args.port + 1}")
        raise
    print(f"Monster Eye running at http://localhost:{args.port}/")
    for u in lan_urls(args.port):
        print(f"  Settings from your phone: {u}/config.html")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    if sys.version_info < (3, 7):
        sys.exit("Monster Eye needs Python 3.7 or newer.")
    main()
