import json
import os
import struct
import tempfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock

from separador_onnx import Separator

LIMIT = 4_400_000
ROOT = Path(__file__).resolve().parent
BUSY = Lock()
separator = None


class Handler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / "dist"), **kwargs)

    def parse_request(self):
        if not super().parse_request():
            return False
        allowed_host = os.environ.get("APP_HOST", "appvocenaguitarra.samueldeazevedo.com.br").lower()
        host = self.headers.get("Host", "").lower()
        if os.environ.get("VERCEL") == "1" and host != allowed_host:
            self.send_error(404)
            return False
        return True

    def do_GET(self):
        if self.path in ("/windows-android", "/ios-mac"):
            self.path = "/index.html"
        super().do_GET()

    def end_headers(self):
        if self.path in ("/sw.js", "/api/separar"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def packet_header(self, kind, size):
        self.chunk(struct.pack(">BI", kind, size))

    def chunk(self, payload):
        self.wfile.write(f"{len(payload):X}\r\n".encode())
        self.wfile.write(payload)
        self.wfile.write(b"\r\n")
        self.wfile.flush()

    def message(self, kind, value):
        payload = json.dumps(value, ensure_ascii=False).encode()
        self.packet_header(kind, len(payload))
        self.chunk(payload)

    def do_POST(self):
        global separator
        if self.path != "/api/separar":
            self.send_error(404)
            return
        self.close_connection = True
        if self.headers.get("Sec-Fetch-Site") not in (None, "same-origin"):
            self.send_error(403)
            return
        if self.headers.get("Content-Type") != "audio/mpeg":
            self.send_error(415)
            return
        size = self.headers.get("Content-Length", "")
        if not size.isascii() or not size.isdecimal() or len(size) > 8 or not 0 < int(size) <= LIMIT:
            self.send_error(413)
            return
        if not BUSY.acquire(blocking=False):
            self.send_error(503)
            return

        try:
            with tempfile.TemporaryDirectory(prefix="tc-guitarra-") as folder:
                output = Path(folder)
                source = output / "original.mp3"
                audio = self.rfile.read(int(size))
                if len(audio) != int(size):
                    self.send_error(400)
                    return
                source.write_bytes(audio)
                del audio
                self.send_response(200)
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Transfer-Encoding", "chunked")
                self.send_header("Connection", "close")
                self.end_headers()
                try:
                    self.message(1, 0)
                    if separator is None:
                        separator = Separator(os.environ.get("MODEL_PATH", ROOT / "model.onnx"), False)
                    tracks, duration = separator.separate(source, output, lambda fraction: self.message(1, fraction))
                    self.message(2, duration)
                    for kind, name in enumerate(("guitar", "backing", "instrumental"), 3):
                        path = tracks[name]
                        self.packet_header(kind, path.stat().st_size)
                        with path.open("rb") as result:
                            while chunk := result.read(65536):
                                self.chunk(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    return
                except ValueError as error:
                    self.message(6, str(error))
                except Exception as error:
                    self.log_error("Separação interrompida (%s)", type(error).__name__)
                    self.message(6, "Não foi possível separar este MP3 no servidor.")
                self.wfile.write(b"0\r\n\r\n")
        finally:
            BUSY.release()


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("PORT", "3000"))), Handler).serve_forever()
