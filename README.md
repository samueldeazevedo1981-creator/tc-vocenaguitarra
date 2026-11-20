# Trucker Cap Você na Guitarra

Este pacote inclui o motor HTDemucs compacto do piloto mobile, os pesos do modelo, o servidor Python com ONNX Runtime e a interface web. O processamento acontece no contêiner. O setlist é salvo no navegador.

## Publicação

Extraia o ZIP. Suba os arquivos extraídos para um repositório e importe-o na Vercel com o preset Container, ou publique a partir da pasta extraída com a CLI da Vercel. Use a raiz que contém Dockerfile.vercel. O ZIP em si é o pacote de código-fonte.

Os domínios padrão são tc-vocenaguitarra.vercel.app e appvocenaguitarra.samueldeazevedo.com.br. Use o endereço estável do projeto para o teste. Para outro domínio, defina APP_HOST na Vercel com o hostname sem https:// e ajuste og:url e og:image em dist/index.html. Na configuração de proteção do projeto, confirme que o domínio usado pelos clientes está acessível sem login.

## Limites

O envio à API aceita até 4,4 MB. Se o MP3 exceder esse tamanho, o navegador prepara uma cópia menor antes do envio. O arquivo usado em Original e no setlist é preservado. A cópia é recodificada com LAME; a recompressão pode reduzir a qualidade. O motor também tem limite de 10 minutos por áudio. O projeto usa os recursos de hospedagem e processamento da Vercel e dispensa Vercel Blob, chave de API e serviço externo de IA.
