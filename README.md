# Trucker Cap Você na Guitarra | Edição Estudo

Escolha um MP3. A opção **Original** fica disponível na hora. Clique em
**Separar guitarra** para liberar **Guitarra isolada**, **Sem guitarra**
e **Sem voz e guitarra**. A guitarra e a voz são estimadas na mesma
passagem do modelo. As bases são montadas quando você as usa.

As músicas separadas entram no **Setlist**. Organize com **Abrir**, **Subir**,
**Descer** ou **Remover**, depois clique em **Salvar setlist** para guardar a
ordem e as faixas editadas neste navegador. Depois de recarregar ou abrir
o app novamente, use **Abrir setlist salvo**. Não é preciso rodar a IA outra
vez. Salvar substitui a cópia anterior; as mudanças feitas após salvar ficam
na sessão até salvar novamente. O setlist não sincroniza entre aparelhos e
pode ser perdido se os dados do site forem apagados.

**Baixar MP3** baixa o arquivo original intacto ou codifica a faixa
editada escolhida. A codificação da faixa editada só começa ao baixar.

## Usar o setlist offline

Abra o app uma vez com internet e aguarde a mensagem **App pronto para
abrir offline neste navegador**. Salve o setlist no aparelho que será
usado. Depois, mesmo sem internet, abra o mesmo endereço e toque em
**Abrir setlist salvo**. O modelo de IA não faz parte do cache offline;
prepare as músicas antes do show. O navegador pode remover os dados se
ficar sem espaço ou se você apagar o armazenamento do site.

## Publicar na Vercel

O `vercel.json` configura a pasta `dist` e os cabeçalhos para processamento
paralelo em navegadores compatíveis. O projeto estático inclui o modelo.
Os endereços `/windows-android` e `/ios-mac` abrem o mesmo aplicativo.

O primeiro uso baixa aproximadamente 38 MB de modelo. O processamento
acontece no navegador e a velocidade depende do aparelho e da música.
