# Trucker Cap Você na Guitarra | Edição Estudo

Escolha um MP3 e toque em **Separar guitarra**. Ouça **Só guitarra** para
tirar riffs e solos de ouvido. Use **Base sem guitarra** para tocar junto,
com a voz e os demais instrumentos. **Baixar MP3** exporta a faixa selecionada.
O aplicativo trabalha com uma música por vez durante a sessão.

## Publicar na Vercel

Extraia os arquivos na raiz de um projeto novo para teste ou em um branch
de prévia. O `vercel.json` configura a pasta `dist` e os cabeçalhos para
processamento paralelo em navegadores compatíveis. O projeto estático
inclui o modelo e todas as dependências, sem necessidade de API.

Os endereços `/windows-android` e `/ios-mac` abrem o mesmo aplicativo. Use
Chrome ou Edge no Windows, Chrome no Android e Safari no iPhone e no Mac.
A velocidade depende do dispositivo, navegador e tamanho da música.
O primeiro uso também precisa baixar aproximadamente 38 MB de modelo.

## Motor

A versão usa as mesmas distribuições do ONNX Runtime Web e do codificador
MP3 LAME do Separador Pan Click v0.5. O modelo do Separador tem quatro
classes e não entrega guitarra dedicada. Esta edição usa o HTDemucs 6S
compacto em INT8 para estimar a guitarra e subtraí-la do áudio original.
O modelo compartilha operações internas entre as fontes, mesmo quando
o aplicativo reconstrói somente o áudio da guitarra.
