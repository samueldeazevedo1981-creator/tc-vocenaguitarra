# Trucker Cap Você na Guitarra · Piloto mobile portátil

O motor HTDemucs compacto e seu modelo ONNX estão incluídos. O navegador envia o MP3 ao seu próprio computador ou servidor. O celular não roda o modelo de IA.

## Testar no celular pelo Wi-Fi

1. No computador, extraia o ZIP para uma pasta. Instale Python 3.12 e FFmpeg e confirme que o comando `ffmpeg` está no PATH.
2. Na pasta extraída, execute `python -m pip install -r requirements.txt` e depois `python servidor.py`.
3. Com o computador ligado e conectado à mesma rede Wi-Fi, abra no celular `http://IP-DO-COMPUTADOR:3000/`. Se necessário, permita que o Python receba conexões na rede privada. Use apenas uma rede de confiança.

Com Docker, os passos de instalação são substituídos por `docker build -t trucker-cap-guitarra .` e `docker run --rm -p 3000:3000 trucker-cap-guitarra`.

O piloto aceita MP3 de até 100 MB e áudio de até 10 minutos. Processa uma música por vez. O áudio recebido e os resultados temporários são apagados quando o servidor termina de responder.

## Acesso pela internet

Para disponibilizar fora do Wi-Fi, execute o contêiner num servidor seu ou numa hospedagem que aceite Docker e use um domínio HTTPS. HTTPS também habilita a instalação do app e a abertura offline. Antes de expor a API publicamente, configure seu controle de acesso e limites de uso no servidor. A velocidade depende da máquina que executa o motor e da conexão. O pacote não precisa de conta na Vercel, Blob ou API de IA de terceiros.
