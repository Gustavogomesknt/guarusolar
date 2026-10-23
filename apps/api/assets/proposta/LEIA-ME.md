# Artes da proposta (modelo novo)

Coloque aqui os arquivos com estes nomes exatos (os caminhos ficam em
`src/conteudo/proposta.ts`, `ARTES_DA_PROPOSTA_NOVA`; para outro nome ou formato, troque lá):

| Arquivo | Onde entra | Tamanho |
| --- | --- | --- |
| `capas/<tipo-de-servico>.jpg` | a capa (página 1), uma por tipo de serviço: ver `capas/LEIA-ME.md` | 2480 x 3508 px (A4 a 300 dpi) |
| `pagina-3.jpg` | fundo inteiro da página 3 | 2480 x 3508 px |
| `foto-documentacao.jpg` | pé do cartão "Documentação de engenharia" | retrato 3:4 |
| `foto-bombeiros.jpg` | pé do cartão "Adequação Corpo de Bombeiros · IT 41" | retrato 3:4 |
| `foto-infraestrutura.jpg` | pé do cartão "Infraestrutura da instalação" (os materiais) | retrato 3:4 |
| `logo-byd.png` | faixa de logos das montadoras (página 3) | 480 x 220 px, fundo transparente |
| `logo-weg.png` | idem | idem |
| `logo-geely.png` | idem | idem |
| `logo-volvo.png` | idem | idem |
| `logo-jeep.png` | idem | idem |
| `logo-bmw.png` | idem | idem |

**Fotos dos cartões:** as três saem do MESMO tamanho, em 3:4 (retrato), centradas no pé do
cartão, com 40 mm de largura (`FOTO_DO_CARTAO` em `src/conteudo/proposta.ts`). Menores só quando
o cartão não tem altura para elas (muitos itens), sempre em 3:4. Mande sempre em 3:4: o sistema
não força proporção, e o que passar dela é cortado. As de 23/10/2026 têm uns 225 px de largura
(a de infraestrutura, 178 px): não aumente os 40 mm, ou a foto borra. Sem o arquivo, o cartão sai
sem foto e o PDF é gerado assim mesmo.

**Logos das montadoras:** todas vêm recortadas e centradas na mesma caixa de 480 x 220 px, com
fundo transparente, e saem todas do mesmo tamanho (24 mm de largura, na proporção do arquivo;
`PAGINA_3_NOVA.montadoras` tem a posição). Não passe de 25 mm. A ordem da faixa é a da lista
`logosDasMontadoras`. Logo que falta é pulada, e as outras se espalham na faixa.

**Capa e página 3:** sem o arquivo, o PDF mostra um retângulo cinza com o nome esperado.

Prefira JPG com até uns 500 KB cada: o PDF inteiro vai pelo WhatsApp.
