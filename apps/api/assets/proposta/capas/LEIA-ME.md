# Capas da proposta (página 1)

Uma imagem por **tipo de serviço** vendido (tela "Tipos de serviço" do escritório). O nome do
arquivo é o nome do tipo **sem acento, em minúsculas, com hífen no lugar dos espaços e da
pontuação**, em JPG (ou PNG), A4 em retrato (2480 x 3508 px):

| Tipo de serviço | Arquivo |
| --- | --- |
| Instalação de carregador veicular | `instalacao-de-carregador-veicular.jpg` (a capa PADRÃO) |
| Instalação de sistema fotovoltaico | `instalacao-de-sistema-fotovoltaico.jpg` |
| Manutenção de carregador veicular | `manutencao-de-carregador-veicular.jpg` |
| Manutenção de sistema fotovoltaico | `manutencao-de-sistema-fotovoltaico.jpg` |
| Reparo / corretiva | `reparo-corretiva.jpg` |

**Para acrescentar uma capa:** ponha o arquivo do tipo nesta pasta, com o nome da tabela, e
publique. Não há código para mudar: o orçamento daquele tipo passa a sair com a capa dele e o
aviso do gerador some para esse tipo.

**Tipo sem capa própria** sai com a capa padrão (a de carregador, porque hoje a Guarusolar só
vende carregador), e o gerador avisa o vendedor antes de gerar o PDF ou enviar pelo WhatsApp. A
capa padrão está em `src/conteudo/proposta.ts` (`CAPAS_DA_PROPOSTA.padrao`).

**Renomeou um tipo** na tela "Tipos de serviço"? Renomeie o arquivo junto: o nome esperado
acompanha o nome do tipo.
