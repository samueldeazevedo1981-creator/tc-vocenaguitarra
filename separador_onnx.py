"""Native inference for guitar and voice using the same model as the web app."""
import hashlib
import math
import os
import subprocess
from pathlib import Path

import numpy as np
import onnxruntime as ort

RATE = 44100
SEGMENT = 343980
OVERLAP = SEGMENT - math.floor(SEGMENT * .9)
STRIDE = SEGMENT - OVERLAP
MODEL_SHA = "7ce55792e2231c93fbf92de95f5fd5b3a5e6c89f7db690dfd693e8f1dce56869"
MAX_SECONDS = 600


class Separator:
    def __init__(self, model, use_cuda):
        with Path(model).open("rb") as stream:
            if hashlib.file_digest(stream, "sha256").hexdigest() != MODEL_SHA:
                raise ValueError("O arquivo não corresponde ao modelo HTDemucs 6S do app.")
        providers = ["CUDAExecutionProvider", "CPUExecutionProvider"] if use_cuda else ["CPUExecutionProvider"]
        if use_cuda and providers[0] not in ort.get_available_providers():
            raise RuntimeError("CUDA está indisponível no ONNX Runtime deste servidor.")
        options = ort.SessionOptions()
        options.enable_cpu_mem_arena = False
        options.enable_mem_pattern = False
        options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_BASIC
        if not use_cuda:
            cpu_count = os.cpu_count()
            if hasattr(os, "sched_getaffinity"):
                cpu_count = len(os.sched_getaffinity(0))
            options.intra_op_num_threads = min(8, cpu_count or 1)
            options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_EXTENDED
        self.session = ort.InferenceSession(str(model), sess_options=options, providers=providers)
        if use_cuda and self.session.get_providers()[0] != providers[0]:
            raise RuntimeError("O ONNX Runtime não conseguiu iniciar CUDA.")
        self.session.disable_fallback()
        self.engine = "GPU (CUDA)" if use_cuda else "CPU nativa"

    def separate(self, source, output, progress, clip=None):
        trim = ["-ss", str(clip[0])] if clip else []
        duration = clip[1] if clip else MAX_SECONDS + 1
        audio = subprocess.run(
            ["ffmpeg", "-nostdin", "-v", "error", *trim, "-i", str(source), "-vn",
             "-t", str(duration), "-ar", str(RATE), "-ac", "2", "-f", "f32le", "pipe:1"],
            check=True, capture_output=True, timeout=60,
        ).stdout
        stereo = np.frombuffer(audio, dtype="<f4").reshape(-1, 2)
        if not 0 < len(stereo) <= MAX_SECONDS * RATE:
            raise ValueError("O teste aceita músicas de até 10 minutos.")
        result = self.infer(stereo, progress)
        stems = {}
        mix = stereo.T
        guitar, voice = result
        backing = mix - guitar
        np.subtract(backing, voice, out=voice)
        instrumental = voice
        for kind, track in (("guitar", guitar), ("backing", backing), ("instrumental", instrumental)):
            dest = output / f"{kind}.mp3"
            subprocess.run(
                ["ffmpeg", "-nostdin", "-v", "error", "-f", "f32le",
                 "-ar", str(RATE), "-ac", "2", "-i", "pipe:0",
                 "-c:a", "libmp3lame", "-b:a", "192k", "-write_xing", "1", str(dest)],
                input=np.ascontiguousarray(track.T, dtype="<f4").tobytes(), check=True, timeout=60,
            )
            stems[kind] = dest
        return stems, len(stereo) / RATE

    def infer(self, stereo, progress):
        size = len(stereo)
        count = max(1, 1 + math.ceil((size - SEGMENT) / STRIDE))
        result = np.zeros((2, 2, size), dtype=np.float32)
        weights = np.zeros(size, dtype=np.float32)
        wave = np.zeros((1, 2, SEGMENT), dtype=np.float32)
        for block in range(count):
            start = block * STRIDE
            length = min(SEGMENT, size - start)
            samples = slice(start, start + length)
            wave.fill(0)
            wave[0, :, :length] = stereo[samples].T
            stems = self.session.run(["stems"], {"mix": wave})[0]
            if stems.shape != (1, 6, 2, SEGMENT):
                raise ValueError("Saída incompatível com HTDemucs 6S.")
            ramp = np.ones(length, dtype=np.float32)
            edge = min(OVERLAP, length)
            if block:
                ramp[:edge] = np.arange(1, edge + 1) / OVERLAP
            if block + 1 < count:
                ramp[-edge:] = np.minimum(ramp[-edge:], np.arange(edge, 0, -1) / OVERLAP)
            result[:, :, samples] += stems[0, [4, 3], :, :length] * ramp
            weights[samples] += ramp
            progress((block + 1) / count)
        result /= weights
        if not np.isfinite(result).all():
            raise ValueError("A IA retornou amostras inválidas.")
        return result
