import type { LocalPostInput } from "../types";

const post: LocalPostInput = {
  slug: "qualidade-do-ar-interior-co2-escritorio",
  title: "Qualidade do ar interior: por que o CO₂ importa tanto quanto a temperatura",
  publishedAt: "2026-07-14T09:00:00-03:00",
  excerpt:
    "Sala gelada e todo mundo com sono depois do almoço? O problema pode não ser o ar-condicionado, e sim a falta de ar novo. Entenda os parâmetros da Anvisa para ambientes climatizados e o que fazer para o ar do seu prédio ser realmente saudável.",
  category: "guia-pratico",
  cover: {
    src: "/projetos/K1/k14.jpg",
    alt: "Auditório climatizado com unidades de ar-condicionado no forro",
  },
  body: `
Quando se fala em ar-condicionado, a conversa quase sempre é sobre temperatura. Mas um ambiente climatizado pode estar na temperatura certa e, ainda assim, ter ar ruim: pouco oxigênio novo, CO₂ acumulado, umidade fora da faixa, partículas e fungos circulando pelos dutos. Os sintomas são conhecidos de quem trabalha em escritório — sonolência à tarde, dor de cabeça, olhos secos, resfriados que "pegam" toda a equipe — e têm nome: **síndrome do edifício doente**.

A boa notícia é que a qualidade do ar interior (QAI) é mensurável, tem parâmetros oficiais no Brasil e, na maioria dos casos, pode ser corrigida com ajustes no sistema existente.

## O que diz a Anvisa

A **Resolução RE nº 9/2003** da Anvisa estabelece os padrões referenciais de qualidade do ar para ambientes climatizados artificialmente de uso público e coletivo. Os valores que todo gestor deveria conhecer:

- **Dióxido de carbono (CO₂):** no máximo **1.000 ppm**. O CO₂ em si não é tóxico nessa faixa; ele é o indicador de que o ar está sendo renovado o suficiente para diluir tudo o mais que as pessoas exalam;
- **Fungos:** no máximo **750 UFC/m³**, com relação entre interior e exterior de até 1,5 — acima disso, há proliferação dentro do sistema;
- **Partículas (aerodispersoides):** no máximo **80 µg/m³**;
- **Temperatura:** 23 °C a 26 °C no verão e 20 °C a 22 °C no inverno;
- **Umidade relativa:** 40% a 65% no verão e 35% a 65% no inverno;
- **Velocidade do ar:** menor que 0,25 m/s na zona ocupada (ninguém gosta de "vento" no pescoço);
- **Renovação de ar:** no mínimo **27 m³/h por pessoa** — ou 17 m³/h por pessoa em ambientes de alta rotatividade, como lojas, desde que o CO₂ se mantenha abaixo do limite.

Esses parâmetros são a referência de controle do PMOC exigido pela **Lei 13.589/2018**, e a **ABNT NBR 16401** detalha, para o projeto, as vazões de ar exterior e a filtragem por tipo de ambiente.

## Por que o CO₂ sobe

Pessoas exalam CO₂. Em uma sala fechada com o ar-condicionado recirculando o mesmo ar, a concentração sobe ao longo do dia e atinge o pico no meio da tarde — exatamente o horário da queda de rendimento. As causas mais comuns de CO₂ alto em prédios:

1. **Tomada de ar externo fechada ou reduzida**, muitas vezes de propósito, para economizar energia (ar externo quente custa mais para resfriar);
2. **Ocupação maior do que o projeto previu** — uma sala projetada para dez pessoas e usada por vinte;
3. **Splits sem renovação**: o split não traz ar de fora. Salas de reunião climatizadas por split e sem ventilação mecânica ficam com o ar "pesado" em minutos;
4. **Filtros saturados e ventiladores fora de regulagem**, que reduzem a vazão total do sistema.

## Umidade, fungos e dutos

A umidade fora da faixa é o outro vilão silencioso. Ar muito seco causa irritação de olhos e vias aéreas; ar muito úmido, aliado a serpentinas e bandejas sujas, cria o ambiente ideal para fungos — que o próprio sistema distribui pelos ambientes. Por isso o plano de manutenção inclui a limpeza de serpentinas e bandejas, a desobstrução de drenos e a inspeção dos dutos. Dutos internamente sujos ou com umidade são o caso em que a higienização completa se justifica.

## Como saber se o ar do seu prédio está bom

A avaliação da qualidade do ar é feita com medições no ambiente (CO₂, temperatura, umidade, velocidade) e coletas para análise de fungos e partículas, comparadas aos valores da RE 9. A resolução prevê avaliação periódica, e em muitos prédios ela é feita semestralmente. Medidores de CO₂ de baixo custo, hoje comuns, também dão uma boa indicação contínua: se a leitura passa de 1.000 ppm todo dia à tarde, há um problema de renovação.

## O que normalmente resolve

- **Reabrir e regular a tomada de ar externo**, e verificar se o ventilador e os filtros entregam a vazão de projeto;
- **Instalar ventilação mecânica ou unidade de tratamento de ar externo** em ambientes atendidos por splits ou VRF;
- **Recuperadores de calor**, que trazem ar novo pré-resfriado pelo ar que sai — aumentam a renovação sem explodir a conta de energia;
- **Filtragem adequada** ao uso do ambiente, com troca conforme a saturação, e não "quando lembrar";
- **Higienização de serpentinas, bandejas e dutos** e correção de infiltrações.

> Economizar energia fechando a renovação de ar é trocar uma conta de luz menor por uma equipe adoecendo. Com recuperação de calor e controle por demanda (sensores de CO₂ que abrem o ar externo só quando precisa), dá para ter os dois.

## Por que isso importa para quem gerencia

Para o síndico ou gestor de facilities, QAI é um tema de saúde, de produtividade e de conformidade: os parâmetros fazem parte do PMOC, são fiscalizados pela vigilância sanitária e costumam ser medidos por peritos em disputas sobre condições de trabalho. Para o locador de lajes corporativas, é cada vez mais um diferencial cobrado por locatários e por certificações de edifícios saudáveis.

## Como a RLP pode ajudar

A RLP Engenharia projeta e instala sistemas de renovação, filtragem e tratamento de ar, e mantém sistemas de [climatização](/servicos#climatizacao) de empresas e condomínios em São Paulo com [planos de manutenção](/manutencao) que incluem o controle dos parâmetros do PMOC. Se o ar do seu prédio "parece pesado", [peça uma avaliação](https://wa.me/5511985782307?text=Olá,%20gostaria%20de%20avaliar%20a%20qualidade%20do%20ar%20do%20meu%20prédio): a medição é rápida, e a correção quase sempre é mais simples do que parece.
`,
};

export default post;
