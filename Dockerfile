FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg \
    && rm -rf /var/lib/apt/lists/*
RUN pip install onnxruntime==1.23.2

ARG MODEL_URL=https://huggingface.co/alekshandru/htdemucs-6s-onnx/resolve/main/htdemucs_6s_fp16weights.onnx?download=true
RUN mkdir -p /app/modelos \
    && curl --fail --location --retry 2 --max-time 300 "$MODEL_URL" -o /app/modelos/htdemucs_6s_fp16weights.onnx \
    && echo '7ce55792e2231c93fbf92de95f5fd5b3a5e6c89f7db690dfd693e8f1dce56869  /app/modelos/htdemucs_6s_fp16weights.onnx' | sha256sum -c -

RUN useradd --create-home --uid 10001 app
COPY servidor.py separador_onnx.py iniciar-render.sh /app/
COPY dist /app/dist
USER app
EXPOSE 10000
CMD ["sh", "/app/iniciar-render.sh"]
