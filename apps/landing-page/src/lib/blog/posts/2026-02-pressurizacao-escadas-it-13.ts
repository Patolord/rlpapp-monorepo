import type { LocalPostInput } from "../types";

const post: LocalPostInput = {
  slug: "pressurizacao-de-escadas-it-13-erros-que-reprovam-a-vistoria",
  title: "Pressurização de escadas: o que a IT 13 exige e os erros que reprovam a vistoria",
  publishedAt: "2026-02-12T09:00:00-03:00",
  excerpt:
    "Pressão diferencial, velocidade na porta aberta, redundância de ventiladores e integração com a detecção: um guia técnico para construtoras sobre o que o Corpo de Bombeiros verifica — e o que costuma dar errado na obra.",
  category: "para-construtoras",
  cover: {
    src: "/projetos/brasilia/brasilia5.jpg",
    alt: "Ventiladores do sistema de pressurização e extração de fumaça em casa de máquinas",
  },
  body: `
A escada de segurança é a rota de fuga de um edifício alto. Em um incêndio, ela só cumpre esse papel se permanecer livre de fumaça — e é isso que o sistema de pressurização garante: ventiladores insuflam ar na caixa da escada, criando uma pressão positiva que impede a fumaça de entrar pelas frestas e pelas portas quando elas se abrem.

No Estado de São Paulo, o sistema é regido pela **Instrução Técnica 13 (IT 13) do Corpo de Bombeiros (CBPMESP)**, no âmbito do Regulamento de Segurança contra Incêndio instituído pelo **Decreto Estadual 69.118/2024**, com os critérios de projeto da **ABNT NBR 14880**. A escada em si — quando ela é exigida, dimensões, portas — segue a **ABNT NBR 9077**, que ganhou nova edição em 2025.

Este artigo resume o que o projeto e a execução precisam entregar e, principalmente, os erros que mais reprovam a vistoria.

## O que o sistema precisa garantir

Os critérios de desempenho são poucos, mas precisam ser atendidos ao mesmo tempo:

- **Pressão diferencial com as portas fechadas:** o valor de projeto usual é de **50 Pa** entre a escada e os ambientes adjacentes. Na vistoria, a pressão não pode ficar abaixo de 90% do valor de projeto nem ultrapassar **60 Pa** — acima disso, a força para abrir a porta corta-fogo passa a comprometer a fuga.
- **Velocidade de ar através da porta aberta:** com o número de portas abertas previsto em projeto (NPA), o fluxo pelo vão da porta deve manter velocidade mínima de **1 m/s**, o que impede a fumaça de "entrar contra o vento". No teste de aceitação, a média medida no vão costuma ficar entre 1 e 2 m/s.
- **Alívio de sobrepressão:** com todas as portas fechadas, o ar insuflado precisa de saída controlada. É o damper de alívio (ou o controle de rotação do ventilador) que mantém a pressão dentro da faixa.
- **Acionamento automático:** o sistema deve partir automaticamente por comando do sistema de detecção e alarme, além do acionamento manual em local acessível à brigada e ao Corpo de Bombeiros.

Esses números saem diretamente do cálculo de vazão: área de frestas das portas e das aberturas da caixa da escada (vazamento), número de portas abertas simultaneamente e velocidade requerida. Projetos que ignoram o vazamento real da caixa da escada — juntas de alvenaria, passagens de instalações, portas sem vedação — chegam na obra com ventilador subdimensionado.

## Ventiladores, dutos e energia

A IT 13 recomenda **dois conjuntos motor-ventilador** para todos os sistemas. Um único ventilador é admitido em edificações menores — como residenciais de até 80 m, escritórios de até 60 m e escolas de até 30 m de altura —, e há a alternativa de dois grupos com 50% da vazão cada, que somam 100% em emergência. Hospitais, shoppings, edifícios muito altos e locais de grande concentração de público pedem reserva.

A tomada de ar externo deve ficar em posição que não capte fumaça (longe de fachadas com risco de incêndio e de descargas de exaustão), e o duto de insuflação precisa chegar à escada com injeção distribuída ao longo da altura, para evitar que os pavimentos mais afastados do ventilador fiquem sem pressão.

Quanto à energia, o projeto precisa prever alimentação elétrica protegida e fonte alternativa, com cabeamento e quadro posicionados de modo a continuar operando durante o incêndio. Ventilador que desliga quando o prédio perde energia não é sistema de segurança.

## Os erros que mais reprovam a vistoria

Na nossa experiência executando e mantendo sistemas de pressurização em São Paulo, os motivos de reprovação se repetem:

1. **Caixa da escada que vaza.** Shafts abertos, passagens de tubulação sem vedação, portas corta-fogo empenadas ou sem mola de fechamento. O ventilador até parte, mas a pressão não chega aos 50 Pa. Esse é o erro mais comum e quase sempre nasce na fase de alvenaria e vedações — não no sistema de ventilação.
2. **Porta corta-fogo que não fecha sozinha ou não abre com a pressão.** Mola fraca, barra antipânico mal regulada ou sobrepressão por falta de damper de alívio. A vistoria testa a abertura das portas com o sistema ligado.
3. **Falta de integração com a detecção.** O sistema funciona no botão, mas a central de alarme não envia o comando de partida — porque a interface ficou para "depois" ou porque a obra trocou a central e ninguém reprogramou.
4. **Ventilador fora de rotação ou sentido invertido.** Parece básico, mas acontece em sistemas que nunca passaram por teste de aceitação com medição.
5. **Documentação incompleta.** O Corpo de Bombeiros pede o projeto aprovado, a ART de execução e os relatórios de teste. Sem o laudo de medição de pressão e velocidade, não há como comprovar o desempenho.

## O que a construtora deve exigir na entrega

Para não descobrir o problema na vistoria do AVCB, o sistema deve ser entregue com:

- Teste de aceitação com **medição de pressão diferencial** em vários pavimentos, com as portas fechadas, e **medição de velocidade** no vão da porta com o NPA de projeto;
- Teste de acionamento automático a partir do sistema de detecção, incluindo sistemas de dois estágios quando houver;
- Verificação do damper de alívio e do limite de 60 Pa;
- Relatório fotográfico e laudo assinado, com ART;
- Treinamento da equipe de operação do edifício (como acionar, como rearmar e o que nunca desligar).

## Manutenção: o sistema só vale se funcionar no dia

Diferente do ar-condicionado, o sistema de pressurização passa anos parado. Ventilador que não gira trava; damper que não abre emperra; bateria da central que não é trocada descarrega. Por isso, o teste periódico de funcionamento, a lubrificação dos mancais e a simulação integrada com o alarme fazem parte do plano de manutenção dos edifícios que atendemos — e são o que mantém o AVCB renovável sem surpresas.

## Como a RLP pode ajudar

A RLP Engenharia projeta, executa e mantém sistemas de [pressurização de escadas](/servicos#pressurizacao), [extração de fumaça](/servicos#extracao) e [detecção e alarme](/servicos#deteccao) para construtoras e incorporadoras no Estado de São Paulo, com equipes próprias, testes de desempenho em campo e documentação completa para o AVCB. Se a sua obra está em fase de instalações, [fale com a nossa engenharia](https://wa.me/5511985782307?text=Olá,%20gostaria%20de%20um%20orçamento%20para%20pressurização%20de%20escadas) e evite retrabalho na vistoria.
`,
};

export default post;
