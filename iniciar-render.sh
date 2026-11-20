#!/bin/sh
set -eu
APP_ORIGIN=${TC_APP_ORIGIN:-${RENDER_EXTERNAL_URL:-}}
: "${APP_ORIGIN:?Configure a origem HTTPS do serviço.}"
: "${TC_PILOT_TOKEN:?Configure TC_PILOT_TOKEN como segredo do piloto.}"

exec python /app/servidor.py \
  --host 0.0.0.0 \
  --port "${PORT:-10000}" \
  --origin "${APP_ORIGIN%/}" \
  --onnx /app/modelos/htdemucs_6s_fp16weights.onnx
