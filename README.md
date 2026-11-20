# Trucker Cap Você na Guitarra
## Piloto online com dois endereços

As duas páginas usam o mesmo serviço de separação.

- Windows e Android em `/windows-android`.
- iPhone, iPad e Mac em `/ios-mac`.

Escolha um MP3 e toque em **Separar online**. O servidor devolve guitarra
isolada, base com voz e base sem voz em MP3. A música original permanece
disponível para reprodução a partir do arquivo selecionado. O navegador
toca e salva os MP3s prontos, e a inferência roda no servidor.

## Publicação do piloto privado

O Dockerfile instala FFmpeg e ONNX Runtime e verifica o SHA-256 do modelo.
Em uma hospedagem Docker com HTTPS, use uma instância com memória
suficiente para o modelo. Reserve pelo menos 8 GiB para o teste inicial.
No Render, `RENDER_EXTERNAL_URL` fornece a origem do serviço. Em outro
provedor, defina `TC_APP_ORIGIN` com a origem HTTPS sem caminho. Configure
`TC_PILOT_TOKEN` como segredo aleatório de pelo menos 32 caracteres. O
comando de inicialização usa a porta `PORT` ou 10000. O endpoint de saúde é
`/api/roformer?available=1`.

O piloto usa uma chave compartilhada e aceita uma música por vez, com
até 100 MB e dez minutos. Aceita MP3. O original recebido é apagado após
o processamento. Os MP3s resultantes ficam na pasta temporária até o
próximo trabalho ou a reinicialização do serviço. O botão Cancelar fecha
a operação no navegador; um trabalho já enviado pode continuar no servidor.

Antes de liberar para clientes, valide a duração ponta a ponta em Android e
iOS e defina autenticação individual, concorrência e retenção de arquivos.

## Usar a Vercel para os dois endereços

Importe este projeto na Vercel. Ele publica somente os arquivos de `dist`.
Configure `TC_SEPARATOR_URL` na Vercel com a URL HTTPS do servidor Docker
terminada em `/api/roformer`, e defina `TC_APP_ORIGIN` no servidor Docker
como o domínio HTTPS publicado pela Vercel, sem caminho ou barra final.
O MP3 segue direto do navegador para o servidor Docker. Nunca inclua
`TC_PILOT_TOKEN` nas variáveis da interface da Vercel.
