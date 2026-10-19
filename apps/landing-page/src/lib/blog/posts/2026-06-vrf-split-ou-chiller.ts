import type { LocalPostInput } from "../types";

const post: LocalPostInput = {
  slug: "vrf-split-ou-chiller-como-escolher-o-sistema-de-climatizacao",
  title: "VRF, split ou chiller: como escolher o sistema de climatização do empreendimento",
  publishedAt: "2026-06-09T09:00:00-03:00",
  excerpt:
    "A escolha do sistema define custo de obra, consumo de energia, espaço técnico e a manutenção pelos próximos 20 anos. Um comparativo objetivo por tipologia — residencial, corporativo, varejo e saúde — para quem precisa decidir na fase de projeto.",
  category: "para-construtoras",
  cover: {
    src: "/projetos/sky/sky1.jpg",
    alt: "Bombas e tubulação de água gelada de uma central de climatização",
  },
  body: `
Poucas decisões de projeto têm tanto efeito sobre o custo de operação de um edifício quanto o sistema de climatização. Ela define o espaço técnico necessário, a carga elétrica, o ruído, a flexibilidade para os ocupantes e o custo de manutenção por décadas — e, uma vez iniciadas as instalações, praticamente não pode ser revista.

Este artigo compara as três famílias mais usadas em empreendimentos no Brasil — **splits**, **VRF/VRV** e **sistemas centrais com chiller** — e sugere critérios objetivos para a decisão, à luz da **ABNT NBR 16401** (partes 1 e 2 na edição de 2024).

## Splits: simples, descentralizado, limitado

O split é o sistema mais conhecido: uma unidade interna por ambiente, ligada a uma condensadora própria (ou a uma multi-split para poucos ambientes). Para o construtor, as vantagens são claras: baixo custo inicial, instalação simples, independência entre unidades — se um quebra, os demais seguem funcionando — e nenhuma casa de máquinas.

Os limites aparecem com a escala. Dezenas de condensadoras precisam de fachada, laje ou áreas técnicas; a distância entre unidade interna e externa é restrita; a eficiência global é menor do que a de sistemas centrais; e a renovação de ar precisa de solução à parte, já que o split apenas recircula o ar do ambiente. Em edifícios residenciais, a solução usual é prever a infraestrutura (ponto frigorígeno, dreno e elétrica) e deixar a compra do equipamento para o morador — o que exige pensar a posição das condensadoras na fachada desde o projeto de arquitetura.

**Onde faz sentido:** residencial (infraestrutura para o morador), pequenos comércios, ambientes isolados que precisam de operação independente (salas de TI, por exemplo).

## VRF: flexibilidade com eficiência

O VRF (*variable refrigerant flow*) conecta várias unidades internas a uma condensadora com compressor de capacidade variável, por uma rede de tubulação frigorígena. Cada ambiente tem controle individual; a condensadora modula a capacidade conforme a demanda real; e sistemas com recuperação de calor permitem resfriar uma zona enquanto aquecem outra.

Para edifícios corporativos e hotéis, é hoje a escolha mais frequente: eficiência elevada em carga parcial (que é o regime em que os prédios operam na maior parte do tempo), ocupação reduzida de área técnica, controle por zona e possibilidade de medição de consumo por unidade — útil em lajes corporativas multilocatário.

Os cuidados: o VRF é um sistema de **refrigerante distribuído pelo edifício**, o que exige projeto rigoroso de rede frigorígena (comprimentos e desníveis máximos, dimensionamento de tubulação, brasagem e teste de estanqueidade) e atenção aos limites de concentração de refrigerante em ambientes pequenos. A renovação de ar e o tratamento do ar externo também precisam ser projetados à parte — com unidades de tratamento de ar externo ou recuperadores de calor.

**Onde faz sentido:** escritórios, hotéis, clínicas, escolas, varejo de médio porte, residencial de alto padrão com climatização entregue.

## Chiller + fan-coils: o sistema central

No sistema central, um ou mais chillers resfriam água, que circula por uma rede hidrônica até fan-coils ou unidades de tratamento de ar nos ambientes. Chillers podem ser resfriados a ar ou a água (com torres de resfriamento), e os maiores equipamentos atingem eficiências que nenhum sistema descentralizado alcança.

É a solução para grandes cargas e para edifícios em que a qualidade do ar e o controle de umidade são críticos: hospitais, laboratórios, shoppings, data centers, grandes centros corporativos. Permite centralizar a filtragem e a renovação de ar, tratar o ar externo com precisão, integrar termoacumulação e automação predial completa.

O preço disso é **infraestrutura**: casa de máquinas, torres, bombas, rede hidrônica com isolamento, tratamento de água, operação qualificada e um plano de manutenção robusto. O custo inicial é maior e o sistema exige decisão cedo no projeto, porque a central define estrutura, laje técnica e carga elétrica.

**Onde faz sentido:** grandes empreendimentos corporativos, hospitais, shoppings, indústria, qualquer edifício acima de algumas centenas de TR ou com requisitos rigorosos de qualidade do ar.

## Os critérios que decidem

Em vez de perguntar "qual é o melhor sistema", a pergunta útil é "qual atende este edifício ao menor custo total". Os critérios que usamos para orientar a decisão:

1. **Perfil de carga e ocupação.** Carga concentrada e previsível favorece sistemas centrais; cargas variáveis por zona e horários diferentes favorecem VRF; ambientes independentes e pequenos favorecem splits.
2. **Custo do ciclo de vida.** Compare investimento inicial, consumo de energia estimado (com base no regime de carga parcial, não no pico), manutenção e vida útil. A eficiência nominal do catálogo diz pouco sobre a conta de luz real.
3. **Espaço e estrutura.** Casa de máquinas, lajes técnicas, shafts, fachada para condensadoras, peso de torres e chillers — tudo precisa existir no projeto de arquitetura e estrutura.
4. **Qualidade do ar e renovação.** Como o sistema vai entregar o ar externo exigido pela NBR 16401-3 e pela RE 9 da Anvisa? Em VRF e splits, isso é um subsistema a mais; no central, faz parte da unidade de tratamento.
5. **Fluido refrigerante.** Com a redução gradual dos HFCs prevista pela Emenda de Kigali, fluidos de menor potencial de aquecimento global (como o R-32, que vem substituindo o R-410A em splits e VRFs) ganham espaço. Vale avaliar disponibilidade, custo futuro do fluido e requisitos de segurança para refrigerantes levemente inflamáveis.
6. **Operação e manutenção.** Quem vai operar o sistema depois da entrega? Um condomínio comercial sem equipe de operação não deveria receber um sistema central complexo sem contrato de manutenção previsto.
7. **Flexibilidade de layout.** Lajes corporativas que serão reconfiguradas a cada novo locatário pedem sistemas que admitam remanejamento de unidades internas e medição individual.

## Erros comuns na especificação

- Dimensionar pela área ("tantos BTU por m²") em vez de cálculo de carga térmica conforme a NBR 16401-1;
- Esquecer a renovação de ar e depois tentar resolver com "um ventilador";
- Prever condensadoras em locais sem dispersão de calor (recirculação de ar quente derruba a capacidade justamente nos dias mais quentes);
- Não reservar espaço de manutenção ao redor dos equipamentos;
- Comparar sistemas apenas pelo preço de compra.

## Como a RLP pode ajudar

A RLP Engenharia instala [sistemas de climatização](/servicos#climatizacao) — VRF, splits e chillers — e [refrigeração](/servicos#refrigeracao) em empreendimentos residenciais, corporativos, de saúde e industriais em São Paulo, desde 1998. Se o seu projeto ainda está definindo o sistema, [converse com a nossa engenharia](https://wa.me/5511985782307?text=Olá,%20gostaria%20de%20uma%20avaliação%20do%20sistema%20de%20climatização%20do%20meu%20empreendimento): a melhor hora para acertar a escolha é antes do primeiro furo na laje.
`,
};

export default post;
