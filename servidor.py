"""Serve the app and run a local BS-RoFormer worker."""
import argparse
import hmac
import json
import math
import os
import re
import shutil
import subprocess
import tempfile
import threading
import uuid
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parent
MODELS = ROOT / "modelos"
WEIGHTS = "BS-Roformer-SW.ckpt"
CONFIG = "BS-Roformer-SW.yaml"
JOBS = {}
LOCK = threading.Lock()
TEMP = None
CLI = None
NATIVE = None
PRIVATE_ORIGIN = None
PILOT_TOKEN = os.getenv("TC_PILOT_TOKEN", "")


def allowed_origins(port):
    origins = {f"http://127.0.0.1:{port}", f"http://localhost:{port}"}
    name = os.getenv("CODESPACE_NAME")
    domain = os.getenv("GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN")
    if os.getenv("CODESPACES") == "true" and name and domain:
        origins.add(f"https://{name}-{port}.{domain}")
    if PRIVATE_ORIGIN:
        origins.add(PRIVATE_ORIGIN)
    return origins


def available():
    return NATIVE is not None or bool(CLI and (MODELS / WEIGHTS).is_file() and (MODELS / CONFIG).is_file())


def separate(job, folder, clip):
    try:
        output = folder / "stems"
        source = folder / "entrada.mp3"
        if NATIVE:
            output.mkdir()
            def progress(value):
                with LOCK:
                    JOBS[job]["progress"] = value
            stems, duration = NATIVE.separate(source, output, progress, clip)
        else:
            duration = None
            if clip:
                trimmed = folder / "trecho.mp3"
                subprocess.run(
                    ["ffmpeg", "-nostdin", "-v", "error", "-ss", str(clip[0]),
                     "-i", str(source), "-t", str(clip[1]), "-vn",
                     "-c:a", "libmp3lame", "-b:a", "320k", str(trimmed)],
                    check=True, timeout=60,
                )
                source = trimmed
            subprocess.run(
                [CLI, str(source), "--model_filename", WEIGHTS,
                 "--model_file_dir", str(MODELS), "--output_dir", str(output),
                 "--output_format", "MP3"],
                cwd=folder, timeout=1200, check=True,
            )
            stems = {}
            for kind in ("guitar", "vocals"):
                matches = [path for path in output.glob("*.mp3")
                           if re.search(r"\(" + kind + r"\)", path.name, re.I)]
                if len(matches) != 1:
                    raise ValueError("Missing stem: " + kind)
                stems[kind] = matches[0]
        with LOCK:
            JOBS[job] = {"status": "done", "folder": folder, "stems": stems, "duration": duration}
    except Exception as error:
        print(f"RoFormer: {error}", flush=True)
        with LOCK:
            JOBS[job] = {"status": "failed", "folder": folder,
                         "error": str(error) if isinstance(error, ValueError) else "O servidor não conseguiu processar o áudio."}
    finally:
        (folder / "entrada.mp3").unlink(missing_ok=True)
        (folder / "trecho.mp3").unlink(missing_ok=True)


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        origin = self.headers.get("Origin")
        if urlsplit(self.path).path == "/api/roformer" and origin in allowed_origins(self.server.server_port):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        super().end_headers()

    def do_OPTIONS(self):
        if urlsplit(self.path).path != "/api/roformer" or self.headers.get("Origin") not in allowed_origins(self.server.server_port):
            return self.reply(403, {"error": "Origem não autorizada."})
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.end_headers()

    def authorized(self):
        supplied = self.headers.get("Authorization", "").encode()
        return not PILOT_TOKEN or hmac.compare_digest(supplied, f"Bearer {PILOT_TOKEN}".encode())

    def reply(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if urlsplit(self.path).path != "/api/roformer":
            return self.reply(404, {"error": "Rota inexistente."})
        if self.headers.get("Origin") not in allowed_origins(self.server.server_port):
            return self.reply(403, {"error": "Abra o app pelo endereço privado configurado no servidor."})
        if not self.authorized():
            return self.reply(401, {"error": "Chave do piloto inválida."})
        if not available():
            return self.reply(503, {"error": "Instale o separador e coloque os dois arquivos em modelos."})
        query = parse_qs(urlsplit(self.path).query, keep_blank_values=True)
        clip = None
        if "start" in query or "duration" in query:
            try:
                start, duration = (float(query[key][0]) for key in ("start", "duration"))
                if not math.isfinite(start) or start < 0 or not 0 < duration <= 600:
                    raise ValueError
                clip = (start, duration)
            except (KeyError, ValueError):
                return self.reply(400, {"error": "Informe um trecho válido de até 10 minutos."})
        try:
            size = int(self.headers.get("Content-Length", 0))
        except ValueError:
            size = 0
        if self.headers.get_content_type() != "audio/mpeg" or not 0 < size <= 100_000_000:
            return self.reply(400, {"error": "Envie um MP3 de até 100 MB."})
        with LOCK:
            if any(item["status"] == "processing" for item in JOBS.values()):
                return self.reply(409, {"error": "Já existe uma música em processamento."})
            for item in JOBS.values():
                shutil.rmtree(item["folder"], ignore_errors=True)
            JOBS.clear()
            job = uuid.uuid4().hex
            folder = Path(TEMP) / job
            folder.mkdir()
            JOBS[job] = {"status": "processing", "folder": folder}
        try:
            with (folder / "entrada.mp3").open("wb") as stream:
                remaining = size
                while remaining:
                    chunk = self.rfile.read(min(remaining, 1024 * 1024))
                    if not chunk:
                        raise OSError("Envio incompleto")
                    stream.write(chunk)
                    remaining -= len(chunk)
        except OSError:
            with LOCK:
                JOBS[job]["status"] = "failed"
            return self.reply(400, {"error": "Envio incompleto."})
        threading.Thread(target=separate, args=(job, folder, clip), daemon=True).start()
        self.reply(200, {"hash": job})

    def do_GET(self):
        url = urlsplit(self.path)
        if url.path in ("/windows-android", "/ios-mac"):
            self.path = "/index.html"
            return super().do_GET()
        if url.path != "/api/roformer":
            return super().do_GET()
        query = parse_qs(url.query)
        if query.get("available") == ["1"]:
            return self.reply(200, {"available": available(), "engine": NATIVE.engine if NATIVE else "RoFormer", "practice": NATIVE is not None, "requiresKey": bool(PILOT_TOKEN)})
        if not self.authorized():
            return self.reply(401, {"error": "Chave do piloto inválida."})
        with LOCK:
            item = JOBS.get(query.get("hash", [""])[0])
            if not item:
                return self.reply(200, {"status": "not_found"})
            if "stem" not in query:
                return self.reply(200, {key: item[key] for key in ("status", "progress", "error", "duration") if key in item})
            path = item.get("stems", {}).get(query["stem"][0])
            if path is None:
                return self.reply(404, {"error": "Faixa indisponível."})
            stream = path.open("rb")
            length = path.stat().st_size
        with stream:
            self.send_response(200)
            self.send_header("Content-Type", "audio/mpeg")
            self.send_header("Content-Length", str(length))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            try:
                shutil.copyfileobj(stream, self.wfile)
            except (BrokenPipeError, ConnectionResetError):
                return


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--onnx", type=Path, help="Arquivo do modelo HTDemucs 6S usado pelo app")
    parser.add_argument("--cuda", action="store_true", help="Exige GPU CUDA no modo ONNX")
    parser.add_argument("--origin", help="Origem HTTPS do gateway privado, sem caminho")
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()
    if args.host not in ("127.0.0.1", "::1") and (not args.origin or len(PILOT_TOKEN) < 32):
        parser.error("Para acesso remoto, configure --origin e TC_PILOT_TOKEN com pelo menos 32 caracteres.")
    if args.origin:
        origin = urlsplit(args.origin)
        if origin.scheme != "https" or not origin.hostname or origin.username or origin.path or origin.query or origin.fragment:
            parser.error("--origin exige uma origem HTTPS sem caminho")
        PRIVATE_ORIGIN = args.origin
    if args.cuda and not args.onnx:
        parser.error("--cuda exige --onnx")
    if args.onnx:
        if not shutil.which("ffmpeg"):
            parser.error("FFmpeg é necessário para o modo ONNX")
        from separador_onnx import Separator
        NATIVE = Separator(args.onnx, args.cuda)
        print(f"HTDemucs pronto · {NATIVE.engine}", flush=True)
    CLI = shutil.which("audio-separator")
    with tempfile.TemporaryDirectory(prefix="trucker-cap-") as TEMP:
        with ThreadingHTTPServer((args.host, args.port), partial(Handler, directory=str(ROOT / "dist"))) as server:
            print(f"Abra http://127.0.0.1:{args.port} · Separação online: {'pronto' if available() else 'arquivos ou dependências ausentes'}", flush=True)
            server.serve_forever()
