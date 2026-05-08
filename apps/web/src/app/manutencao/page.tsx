"use client";

import Image from "next/image";
import { useMemo } from "react";
import {
  CheckCircle,
  Shield,
  Clock,
  Wrench,
  ThermometerSnowflake,
  Wind,
  Flame,
  Phone,
  Calendar,
  TrendingDown,
  Users,
  AlertTriangle,
} from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";

const PHONE_NUMBER = "5511985782307";

export default function ManutencaoPage() {
  const whatsappLink = useMemo(
    () =>
      `https://wa.me/${PHONE_NUMBER}?text=${encodeURIComponent(
        "Olá, gostaria de saber mais sobre os planos de manutenção para condomínio"
      )}`,
    []
  );

  const beneficios = [
    {
      icon: <TrendingDown className="w-8 h-8 text-blue-600" />,
      titulo: "Redução de Custos",
      descricao:
        "Manutenção preventiva evita quebras caras e prolonga a vida útil dos equipamentos em até 40%.",
    },
    {
      icon: <Users className="w-8 h-8 text-blue-600" />,
      titulo: "Menos Reclamações",
      descricao:
        "Moradores satisfeitos com ar funcionando perfeitamente e ambientes sempre climatizados.",
    },
    {
      icon: <Clock className="w-8 h-8 text-blue-600" />,
      titulo: "Atendimento Rápido",
      descricao:
        "Emergências atendidas em até 4 horas. Seu condomínio nunca fica na mão.",
    },
    {
      icon: <Shield className="w-8 h-8 text-blue-600" />,
      titulo: "Conformidade Legal",
      descricao:
        "Sistemas de pressurização e detecção sempre em dia para renovação do AVCB.",
    },
  ];

  const servicos = [
    {
      icon: <ThermometerSnowflake className="w-6 h-6 text-white" />,
      titulo: "Climatização",
      itens: [
        "Manutenção preventiva mensal/trimestral",
        "Limpeza de filtros e serpentinas",
        "Recarga de gás refrigerante",
        "Correção de vazamentos",
        "Troca de peças e componentes",
      ],
    },
    {
      icon: <Wind className="w-6 h-6 text-white" />,
      titulo: "Pressurização",
      itens: [
        "Teste periódico do sistema",
        "Manutenção de ventiladores",
        "Verificação de dampers e dutos",
        "Laudo técnico para AVCB",
        "Ajustes de pressão diferencial",
      ],
    },
    {
      icon: <Flame className="w-6 h-6 text-white" />,
      titulo: "Detecção de Incêndio",
      itens: [
        "Teste de detectores e acionadores",
        "Verificação da central de alarme",
        "Troca de baterias",
        "Laudo para Corpo de Bombeiros",
        "Simulações e testes integrados",
      ],
    },
  ];

  const planos = [
    {
      nome: "Essencial",
      ideal: "Condomínios pequenos",
      frequencia: "Visitas trimestrais",
      destaque: false,
      itens: [
        "Manutenção preventiva trimestral",
        "Atendimento emergencial em até 24h",
        "Relatório técnico por visita",
        "Suporte por WhatsApp",
      ],
    },
    {
      nome: "Profissional",
      ideal: "Condomínios médios e grandes",
      frequencia: "Visitas mensais",
      destaque: true,
      itens: [
        "Manutenção preventiva mensal",
        "Atendimento emergencial em até 4h",
        "Relatório técnico detalhado",
        "Suporte prioritário 24/7",
        "Desconto em peças e reparos",
        "Laudo anual para AVCB incluso",
      ],
    },
    {
      nome: "Premium",
      ideal: "Grandes empreendimentos",
      frequencia: "Visitas quinzenais",
      destaque: false,
      itens: [
        "Manutenção preventiva quinzenal",
        "Atendimento emergencial em até 2h",
        "Técnico dedicado ao condomínio",
        "Gestão completa dos sistemas",
        "Peças inclusas no contrato",
        "Laudo para AVCB + acompanhamento",
      ],
    },
  ];

  const faqCondominios = [
    {
      pergunta: "Qual a frequência ideal de manutenção para meu condomínio?",
      resposta:
        "Depende do tamanho e uso dos sistemas. Para a maioria dos condomínios, recomendamos manutenção mensal na climatização e trimestral nos sistemas de segurança. Fazemos uma avaliação gratuita para definir o melhor plano.",
    },
    {
      pergunta: "Vocês atendem emergências nos finais de semana?",
      resposta:
        "Sim! Nossos planos Profissional e Premium incluem atendimento emergencial 24/7, incluindo finais de semana e feriados.",
    },
    {
      pergunta: "Posso cancelar o contrato a qualquer momento?",
      resposta:
        "Sim. Nossos contratos são flexíveis, com aviso prévio de 30 dias. Não trabalhamos com multas abusivas ou fidelidade forçada.",
    },
    {
      pergunta: "Vocês emitem laudo para renovação do AVCB?",
      resposta:
        "Sim. Emitimos laudos técnicos e ARTs para sistemas de pressurização, detecção de incêndio e exaustão, conforme exigido pelo Corpo de Bombeiros.",
    },
    {
      pergunta: "Como funciona o atendimento emergencial?",
      resposta:
        "Basta ligar ou enviar mensagem pelo WhatsApp. Dependendo do seu plano, garantimos atendimento em 2h, 4h ou 24h. Nossa equipe está sempre de prontidão.",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 py-20 px-6 md:px-12 overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-96 h-96 bg-white rounded-full -translate-x-1/2 -translate-y-1/2"></div>
          <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-white rounded-full translate-x-1/3 translate-y-1/3"></div>
        </div>

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm text-white px-4 py-2 rounded-full text-sm font-medium mb-6">
                <Wrench className="w-4 h-4" />
                Manutenção para Condomínios
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif text-white mb-6 leading-tight">
                Seu condomínio sempre funcionando.{" "}
                <span className="text-blue-300">Sem surpresas.</span>
              </h1>

              <p className="text-xl text-blue-100 mb-8 leading-relaxed">
                Manutenção preventiva e corretiva de climatização, pressurização
                e sistemas contra incêndio. Contratos flexíveis, atendimento
                rápido e laudos para AVCB.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white px-8 py-4 rounded-lg font-bold text-lg shadow-lg hover:shadow-xl transition-all"
                >
                  <FaWhatsapp className="w-6 h-6" />
                  Falar com Especialista
                </a>
                <a
                  href="#planos"
                  className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white px-8 py-4 rounded-lg font-bold text-lg border border-white/30 transition-all"
                >
                  Ver Planos
                </a>
              </div>

              <div className="flex items-center gap-6 text-blue-100">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  <span>Resposta em até 2h</span>
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  <span>27 anos de experiência</span>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="relative rounded-2xl overflow-hidden shadow-2xl">
                <Image
                  src="/technician2.jpeg"
                  alt="Técnico realizando manutenção em sistema de ar condicionado"
                  width={600}
                  height={500}
                  className="object-cover w-full h-[400px] md:h-[500px]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-blue-900/50 to-transparent"></div>
              </div>

              {/* Floating card */}
              <div className="absolute -bottom-6 -left-6 bg-white rounded-xl shadow-xl p-4 flex items-center gap-3">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="font-bold text-blue-950">+500 condomínios</p>
                  <p className="text-sm text-gray-600">atendidos em SP</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problema/Dor Section */}
      <section className="py-16 px-6 md:px-12 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 text-amber-600 mb-4">
              <AlertTriangle className="w-5 h-5" />
              <span className="font-medium">Você já passou por isso?</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-serif text-blue-950">
              Problemas comuns em condomínios sem manutenção
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-red-400">
              <h3 className="font-bold text-blue-950 mb-2">
                Ar-condicionado quebrando no verão
              </h3>
              <p className="text-gray-600">
                Moradores reclamando, custos de reparo emergencial 3x mais caros
                e dificuldade para encontrar técnico disponível.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-red-400">
              <h3 className="font-bold text-blue-950 mb-2">
                AVCB vencido ou reprovado
              </h3>
              <p className="text-gray-600">
                Multas, interdição do prédio e responsabilidade civil do síndico
                por sistemas de segurança inoperantes.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-red-400">
              <h3 className="font-bold text-blue-950 mb-2">
                Conta de energia alta demais
              </h3>
              <p className="text-gray-600">
                Equipamentos sujos ou mal regulados consomem até 30% mais
                energia. A manutenção se paga sozinha.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefícios */}
      <section className="py-16 px-6 md:px-12 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-serif text-blue-950 mb-4">
              Por que contratar manutenção com a RLP?
            </h2>
            <div className="w-24 h-1 bg-blue-600 mx-auto"></div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {beneficios.map((beneficio, index) => (
              <div
                key={index}
                className="text-center p-6 rounded-xl bg-gray-50 hover:bg-blue-50 transition-colors"
              >
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  {beneficio.icon}
                </div>
                <h3 className="text-xl font-bold text-blue-950 mb-2">
                  {beneficio.titulo}
                </h3>
                <p className="text-gray-600">{beneficio.descricao}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Serviços de Manutenção */}
      <section className="py-16 px-6 md:px-12 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-serif text-blue-950 mb-4">
              O que está incluso na manutenção
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Cuidamos de todos os sistemas do seu condomínio com equipe própria
              e certificada.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {servicos.map((servico, index) => (
              <div
                key={index}
                className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="bg-blue-600 p-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                    {servico.icon}
                  </div>
                  <h3 className="text-xl font-bold text-white">
                    {servico.titulo}
                  </h3>
                </div>
                <div className="p-6">
                  <ul className="space-y-3">
                    {servico.itens.map((item, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-700">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="py-16 px-6 md:px-12 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-serif text-blue-950 mb-4">
              Planos de Manutenção
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Escolha o plano ideal para o seu condomínio. Todos incluem
              relatórios, suporte e garantia de qualidade.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {planos.map((plano, index) => (
              <div
                key={index}
                className={`rounded-2xl p-8 ${
                  plano.destaque
                    ? "bg-blue-600 text-white ring-4 ring-blue-300 scale-105"
                    : "bg-gray-50 text-blue-950"
                }`}
              >
                {plano.destaque && (
                  <div className="text-center mb-4">
                    <span className="bg-yellow-400 text-blue-900 text-sm font-bold px-3 py-1 rounded-full">
                      Mais Popular
                    </span>
                  </div>
                )}
                <h3
                  className={`text-2xl font-bold mb-2 ${
                    plano.destaque ? "text-white" : "text-blue-950"
                  }`}
                >
                  {plano.nome}
                </h3>
                <p
                  className={`text-sm mb-1 ${
                    plano.destaque ? "text-blue-100" : "text-gray-500"
                  }`}
                >
                  {plano.ideal}
                </p>
                <p
                  className={`text-lg font-medium mb-6 ${
                    plano.destaque ? "text-blue-200" : "text-blue-600"
                  }`}
                >
                  {plano.frequencia}
                </p>

                <ul className="space-y-3 mb-8">
                  {plano.itens.map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle
                        className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                          plano.destaque ? "text-blue-200" : "text-green-500"
                        }`}
                      />
                      <span
                        className={
                          plano.destaque ? "text-white" : "text-gray-700"
                        }
                      >
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>

                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block text-center py-3 px-6 rounded-lg font-bold transition-all ${
                    plano.destaque
                      ? "bg-white text-blue-600 hover:bg-blue-50"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  Solicitar Proposta
                </a>
              </div>
            ))}
          </div>

          <p className="text-center text-gray-500 mt-8">
            * Valores sob consulta. Fazemos uma avaliação gratuita do seu
            condomínio.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-6 md:px-12 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-serif text-blue-950 mb-4">
              Dúvidas Frequentes
            </h2>
          </div>

          <div className="space-y-4">
            {faqCondominios.map((faq, index) => (
              <details
                key={index}
                className="group bg-white rounded-xl shadow-sm overflow-hidden"
              >
                <summary className="flex items-center justify-between p-6 cursor-pointer list-none">
                  <h3 className="font-semibold text-blue-950 pr-4">
                    {faq.pergunta}
                  </h3>
                  <span className="text-blue-600 group-open:rotate-180 transition-transform">
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </span>
                </summary>
                <div className="px-6 pb-6">
                  <p className="text-gray-600">{faq.resposta}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-16 px-6 md:px-12 bg-blue-900">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-serif text-white mb-4">
            Pronto para cuidar do seu condomínio?
          </h2>
          <p className="text-xl text-blue-100 mb-8">
            Solicite uma avaliação gratuita. Nossa equipe vai até o local,
            analisa os sistemas e apresenta a melhor proposta.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white px-8 py-4 rounded-lg font-bold text-lg shadow-lg transition-all"
            >
              <FaWhatsapp className="w-6 h-6" />
              Agendar Avaliação Gratuita
            </a>
            <a
              href="tel:+5511985782307"
              className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white px-8 py-4 rounded-lg font-bold text-lg border border-white/30 transition-all"
            >
              <Phone className="w-5 h-5" />
              (11) 98578-2307
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
