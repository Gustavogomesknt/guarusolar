# Artes da proposta (modelo novo)

Coloque aqui os arquivos com estes nomes exatos (os caminhos ficam em
`src/conteudo/proposta.ts`, `ARTES_DA_PROPOSTA_NOVA`; para outro nome ou formato, troque lá):

| Arquivo | Onde entra | Tamanho |
| --- | --- | --- |
| `capas/<tipo-de-servico>.jpg` | a capa (página 1), uma por tipo de serviço: ver `capas/LEIA-ME.md` | 2480 x 3508 px (A4 a 300 dpi) |
| `pagina-3.jpg` | fundo inteiro da página 3 | 2480 x 3508 px |
| `foto-documentacao.jpg` | pé do cartão "Documentação de engenharia" | retrato, ~800 x 1600 px |
| `foto-bombeiros.jpg` | pé do cartão "Adequação Corpo de Bombeiros · IT 41" | retrato, ~800 x 1600 px |
| `foto-infraestrutura.jpg` | pé do cartão "Infraestrutura da instalação" (os materiais) | retrato, ~800 x 1600 px |
| `logo-byd.png` | faixa de logos das montadoras (página 3) | 480 x 220 px, fundo transparente |
| `logo-weg.png` | idem | idem |
| `logo-geely.png` | idem | idem |
| `logo-volvo.png` | idem | idem |
| `logo-jeep.png` | idem | idem |
| `logo-bmw.png` | idem | idem |

**Fotos dos cartões:** cada uma preenche o pé do seu cartão na página 2, na LARGURA INTEIRA
do cartão e na altura que sobra abaixo dos itens (de uns 70 a 360 pt, conforme os itens e
quantos grupos a proposta tem). A foto é recortada para caber, centrada, nunca esticada nem
achatada: mande em retrato alto, uns **800 x 1600 px** (1:2), com o assunto no centro. As de
23/10/2026 têm uns 225 px de largura e saem a 80-95 dpi (borradas na impressão). Troque o arquivo
mantendo o nome: o PDF melhora sozinho, sem mexer em código (em produção, depois de publicar).
Sem o arquivo, o cartão sai sem foto e o PDF é gerado assim mesmo.

**Logos das montadoras:** todas vêm recortadas e centradas na mesma caixa de 480 x 220 px, com
fundo transparente, e saem todas do mesmo tamanho (24 mm de largura, na proporção do arquivo;
`PAGINA_3_NOVA.montadoras` tem a posição). Não passe de 25 mm. A ordem da faixa é a da lista
`logosDasMontadoras`. Logo que falta é pulada, e as outras se espalham na faixa.

**Capa e página 3:** sem o arquivo, o PDF mostra um retângulo cinza com o nome esperado.

Prefira JPG com até uns 500 KB cada: o PDF inteiro vai pelo WhatsApp.
