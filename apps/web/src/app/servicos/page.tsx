"use client";

import { useMemo } from "react";
import ServicoSection from "@/components/ServicoSection";

const PHONE_NUMBER = "5511985782307";

export default function ServicosPage() {
  const whatsappLinks = useMemo(
    () => ({
      climatizacao: `https://wa.me/${PHONE_NUMBER}?text=${encodeURIComponent(
        "Olá, gostaria de solicitar um orçamento para climatização"
      )}`,
      refrigeracao: `https://wa.me/${PHONE_NUMBER}?text=${encodeURIComponent(
        "Olá, gostaria de solicitar um orçamento para refrigeração"
      )}`,
      pressurizacao: `https://wa.me/${PHONE_NUMBER}?text=${encodeURIComponent(
        "Olá, gostaria de solicitar um orçamento para pressurização de escadas"
      )}`,
      extracao: `https://wa.me/${PHONE_NUMBER}?text=${encodeURIComponent(
        "Olá, gostaria de solicitar um orçamento para extração de fumaça"
      )}`,
      deteccao: `https://wa.me/${PHONE_NUMBER}?text=${encodeURIComponent(
        "Olá, gostaria de solicitar um orçamento para detecção e alarme de incêndio"
      )}`,
    }),
    []
  );

  return (
    <div className="min-h-screen flex bg-gradient-to-b from-gray-50 to-white flex-col">
      <section className="py-10 md:py-16 px-6 md:px-12">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-5xl md:text-5xl font-serif text-blue-950 mb-4">
            Serviços
          </h1>
          <div className="w-32 h-0.5 bg-blue-900 mx-auto mb-8"></div>

          <div className="flex flex-wrap justify-center gap-3 mb-8">
            <a
              href="#climatizacao"
              className="px-4 py-1.5 text-sm rounded-full bg-white text-blue-950 border border-blue-900 hover:bg-blue-700 hover:text-white transition"
            >
              Climatização
            </a>
            <a
              href="#refrigeracao"
              className="px-4 py-1.5 text-sm rounded-full bg-white text-blue-950 border border-blue-900 hover:bg-blue-700 hover:text-white transition"
            >
              Refrigeração
            </a>
            <a
              href="#pressurizacao"
              className="px-4 py-1.5 text-sm rounded-full bg-white text-blue-950 border border-blue-900 hover:bg-blue-700 hover:text-white transition"
            >
              Pressurização
            </a>
            <a
              href="#extracao"
              className="px-4 py-1.5 text-sm rounded-full bg-white text-blue-950 border border-blue-900 hover:bg-blue-700 hover:text-white transition"
            >
              Extração
            </a>
            <a
              href="#deteccao"
              className="px-4 py-1.5 text-sm rounded-full bg-white text-blue-950 border border-blue-900 hover:bg-blue-700 hover:text-white transition"
            >
              Detecção
            </a>
          </div>
        </div>
      </section>

      <ServicoSection
        id="climatizacao"
        titulo="Climatização"
        imagem="/climatizacao.jpg"
        alt="Técnico realizando manutenção em sistema de ar condicionado"
        itens={[
          {
            titulo: "Conforto térmico inteligente",
            descricao:
              "Desenvolvemos soluções sob medida para garantir ambientes internos agradáveis e com temperatura ideal durante todo o ano. Nossos sistemas de climatização se adaptam automaticamente às variações do clima e da ocupação, proporcionando conforto e produtividade para quem utiliza o espaço.",
          },
          {
            titulo: "Eficiência energética",
            descricao:
              "A climatização eficiente é aquela que entrega desempenho com o menor consumo possível. Por isso, nossos projetos priorizam tecnologias modernas, equipamentos com alta performance e automação, sempre respeitando as exigências de normas como a ABNT NBR 16401 e contribuindo para certificações como LEED e Procel.",
          },
          {
            titulo: "Qualidade do ar interior",
            descricao:
              "Muito além da temperatura, o ar que circula no ambiente deve ser limpo e saudável. Utilizamos sistemas de renovação, filtragem e monitoramento da qualidade do ar para garantir que sua empresa tenha um ambiente seguro, livre de impurezas, bactérias e odores.",
          },
        ]}
        ctaTexto="Solicitar orçamento para climatização"
        ctaLink={whatsappLinks.climatizacao}
      />

      <ServicoSection
        id="refrigeracao"
        titulo="Refrigeração"
        imagem="/refrigeracao.jpg"
        alt="Sistema de refrigeração industrial"
        itens={[
          {
            titulo: "Conservação ideal de produtos",
            descricao:
              "Desenvolvemos sistemas de refrigeração que mantêm as condições ideais de temperatura e umidade para garantir a integridade e durabilidade de produtos perecíveis. Seja para armazenagem de alimentos, medicamentos ou produtos químicos, nossas soluções asseguram máxima eficiência e controle.",
          },
          {
            titulo: "Soluções para diversos setores",
            descricao:
              "Atuamos em projetos para supermercados, indústrias alimentícias, centros de distribuição, hospitais e muito mais. Cada sistema é projetado de forma personalizada, levando em conta as particularidades do setor, volume de armazenamento e exigências normativas.",
          },
          {
            titulo: "Manutenção e operação segura",
            descricao:
              "A confiabilidade é essencial na refrigeração. Por isso, oferecemos planos de manutenção preventiva e corretiva, monitoramento remoto e assistência técnica especializada, garantindo funcionamento contínuo, segurança e economia.",
          },
        ]}
        ctaTexto="Solicitar orçamento para refrigeração"
        ctaLink={whatsappLinks.refrigeracao}
        corBotao="secundario"
        reverse
        bg="bg-gray-50"
      />

      <ServicoSection
        id="pressurizacao"
        titulo="Pressurização de Escadas"
        imagem="/pressurizacao.jpeg"
        alt="Sistema de pressurização de escadas em edifício"
        itens={[
          {
            titulo: "Segurança em situações de emergência",
            descricao:
              "O sistema de pressurização impede a entrada de fumaça nas escadas de emergência durante incêndios, garantindo a evacuação segura dos ocupantes. É um componente essencial do sistema de proteção contra incêndio em prédios comerciais e residenciais.",
          },
          {
            titulo: "Atendimento às normas técnicas",
            descricao:
              "Todos os projetos seguem rigorosamente a NBR 9077 e a Instrução Técnica 13 (IT 13) do Corpo de Bombeiros, garantindo conformidade legal, aprovação em vistorias e segurança para usuários e gestores prediais.",
          },
          {
            titulo: "Instalação e manutenção especializadas",
            descricao:
              "Contamos com equipes treinadas e certificadas para instalar e manter os sistemas de pressurização com excelência, utilizando equipamentos de alto desempenho e realizando testes de performance e simulações em campo.",
          },
        ]}
        ctaTexto="Solicitar orçamento para pressurização"
        ctaLink={whatsappLinks.pressurizacao}
      />

      <ServicoSection
        id="extracao"
        titulo="Extração de Fumaça"
        imagem="/extracao.png"
        alt="Sistema de extração de fumaça industrial"
        itens={[
          {
            titulo: "Segurança em situações de emergência",
            descricao:
              "O sistema de extração de fumaça garante a evacuação segura de fumaça e gases quentes gerados por incêndios, minimizando riscos e danos à estrutura e à saúde dos ocupantes.",
          },
          {
            titulo: "Atendimento às normas técnicas",
            descricao:
              "Todos os projetos seguem rigorosamente a NBR 16401 e as exigências do Corpo de Bombeiros, garantindo conformidade legal, aprovação em vistorias e segurança para usuários e gestores prediais.",
          },
          {
            titulo: "Instalação e manutenção especializadas",
            descricao:
              "Contamos com equipes treinadas e certificadas para instalar e manter os sistemas de extração de fumaça com excelência, utilizando equipamentos de alto desempenho e realizando testes de performance e simulações em campo.",
          },
        ]}
        ctaTexto="Solicitar orçamento para extração de fumaça"
        ctaLink={whatsappLinks.extracao}
        reverse
        bg="bg-gray-50"
      />

      <ServicoSection
        id="deteccao"
        titulo="Detecção e Alarme de Incêndio"
        imagem="/deteccao.jpeg"
        alt="Sistema de detecção de incêndio instalado em edifício comercial"
        itens={[
          {
            titulo: "Resposta rápida a emergências",
            descricao:
              "Nossos sistemas de detecção de incêndio utilizam sensores inteligentes que identificam fumaça, calor ou gases em estágio inicial, acionando automaticamente alarmes e protocolos de segurança. A resposta imediata minimiza riscos, danos e salva vidas.",
          },
          {
            titulo: "Integração com outros sistemas",
            descricao:
              "Os sistemas de alarme são integrados com pressurização de escadas, sprinklers, comandos de desligamento de ventilação e planos de evacuação, garantindo uma resposta coordenada em situações críticas.",
          },
          {
            titulo: "Conformidade legal",
            descricao:
              "Todos os projetos e instalações seguem as normas da ABNT e as exigências do Corpo de Bombeiros, com emissão de ARTs e suporte completo durante o processo de aprovação e vistoria.",
          },
        ]}
        ctaTexto="Solicitar orçamento para detecção de incêndio"
        ctaLink={whatsappLinks.deteccao}
        corBotao="secundario"
      />
    </div>
  );
}
