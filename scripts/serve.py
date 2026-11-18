"""Sirve signal/ y expone un puente local de solo lectura para Bandcamp."""

from __future__ import annotations

import argparse
import html
import json
import re
import threading
import time
import urllib.parse
import urllib.request
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
USER_AGENT = "signal-lecoke/2.0 (+personal music library)"
CACHE_TTL = 30 * 60
CACHE: dict[str, tuple[float, list[dict]]] = {}


def allowed_bandcamp_url(value: str) -> bool:
    parsed = urllib.parse.urlparse(value)
    host = (parsed.hostname or "").lower()
    return (
        parsed.scheme == "https"
        and (host == "bandcamp.com" or host.endswith(".bandcamp.com"))
        and (parsed.path.startswith("/album/") or parsed.path.startswith("/track/"))
    )


def release_tracks(url: str) -> list[dict]:
    cached = CACHE.get(url)
    if cached and time.time() - cached[0] < CACHE_TTL:
        return cached[1]

    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=45) as response:
        source = response.read().decode("utf-8")
    match = re.search(r'data-tralbum="([^"]+)"', source)
    if not match:
        raise RuntimeError("Bandcamp no expuso los datos públicos de reproducción")
    payload = json.loads(html.unescape(match.group(1)))
    tracks = []
    for index, track in enumerate(payload.get("trackinfo") or [], 1):
        stream_url = (track.get("file") or {}).get("mp3-128")
        if not stream_url or track.get("streaming") == 0:
            continue
        tracks.append(
            {
                "title": track.get("title") or f"Pista {index}",
                "artist": track.get("artist") or "",
                "streamUrl": stream_url,
                "duration": track.get("duration") or 0,
                "titleLink": track.get("title_link") or "",
            }
        )
    CACHE[url] = (time.time(), tracks)
    return tracks


class SignalHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST), **kwargs)

    def do_GET(self) -> None:  # noqa: N802 - API de http.server
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/api/bandcamp-release":
            super().do_GET()
            return

        url = urllib.parse.parse_qs(parsed.query).get("url", [""])[0]
        if not allowed_bandcamp_url(url):
            self.send_json({"error": "URL de Bandcamp no permitida"}, 400)
            return
        try:
            self.send_json({"tracks": release_tracks(url)})
        except Exception as error:  # La respuesta conserva un mensaje útil para la UI.
            self.send_json({"error": str(error)}, 502)

    def send_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=4188, type=int)
    parser.add_argument("--no-open", action="store_true")
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), SignalHandler)
    url = f"http://{args.host}:{args.port}/"
    print(f"signal/ listo en {url}")
    if not args.no_open:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
