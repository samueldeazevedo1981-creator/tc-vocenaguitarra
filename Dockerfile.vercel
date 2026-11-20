FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 VERCEL=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates ffmpeg \
    && rm -rf /var/lib/apt/lists/*
RUN pip install numpy==2.2.6 onnxruntime==1.23.2
COPY model.onnx /app/model.onnx
RUN echo "c86c5359ec30592d3ac2883c5faee7d6a3bf971e66e90f3c39a7cf8a0b306973  /app/model.onnx" | sha256sum -c -
COPY servidor.py separador_onnx.py ./
COPY dist ./dist
USER 65534
EXPOSE 3000
CMD ["python", "servidor.py"]
