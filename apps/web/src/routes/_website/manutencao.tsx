import { createFileRoute } from "@tanstack/react-router";
import {
  Wrench,
  Shield,
  Clock,
  FileCheck,
  CheckCircle,
  ArrowRight,
} from "lucide-react";

import ContactSection from "@/components/website/ContactSection";

const WHATSAPP_URL =
  "https://wa.me/5511985782307?text=Olá,%20gostaria%20de%20saber%20mais%20sobre%20os%20planos%20de%20manutenção";

export const Route = createFileRoute("/_website/manutencao")({
  component: ManutencaoPage,
});

function ManutencaoPage() {
  const benefits = [
    {
      icon: <Shield className="w-8 h-8 text-blue-600" />,
      title: "Segurança garantida",
      description:
        "Sistemas sempre em conformidade com as normas de segurança e AVCB.",
    },
    {
      icon: <Clock className="w-8 h-8 text-blue-600" />,
      title: "Atendimento rápido",
      description:
        "Equipe técnica disponível para atendimento emergencial 24/7.",
    },
    {
      icon: <Wrench className="w-8 h-8 text-blue-600" />,
      title: "Manutenção preventiva",
      description:
        "Visitas periódicas programadas para prevenir falhas e garantir eficiência.",
    },
    {
      icon: <FileCheck className="w-8 h-8 text-blue-600" />,
      title: "Laudos e ARTs",
      description:
        "Documentação técnica completa para renovação de AVCB e vistorias.",
    },
  ];

  const plans = [
    {
      name: "Básico",
      description: "Para condomínios residenciais de pequeno porte",
      features: [
        "Visita mensal de inspeção",
        "Manutenção preventiva dos equipamentos",
        "Relatório técnico mensal",
        "Atendimento em até 48h para emergências",
      ],
    },
    {
      name: "Profissional",
      description: "Para condomínios comerciais e de médio porte",
      features: [
        "Visita quinzenal de inspeção",
        "Manutenção preventiva e corretiva",
        "Teste periódico de todos os sistemas",
        "Laudos técnicos para AVCB",
        "Atendimento emergencial em até 24h",
        "Relatório técnico detalhado",
      ],
      featured: true,
    },
    {
      name: "Enterprise",
      description: "Para grandes empreendimentos e indústrias",
      features: [
        "Equipe técnica dedicada",
        "Monitoramento contínuo dos sistemas",
        "Manutenção preventiva e preditiva",
        "Gestão completa de AVCB",
        "Atendimento emergencial 24/7",
        "Relatórios e dashboards personalizados",
      ],
    },
  ];

  return (
    <>
      {/* Hero */}
      <section className="py-16 md:py-24 px-6 md:px-12 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-serif text-blue-950 mb-6">
            Manutenção Preventiva e Corretiva
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
            Contratos de manutenção para condomínios, administradoras e
            indústrias. Mantenha seus sistemas funcionando com segurança e
            eficiência.
          </p>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center bg-blue-600 text-white px-8 py-4 rounded-md hover:bg-blue-700 transition font-bold text-lg"
          >
            Solicitar proposta
            <ArrowRight className="ml-2 w-5 h-5" />
          </a>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-16 px-6 md:px-12">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-serif text-blue-950 text-center mb-12">
            Por que contratar manutenção?
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {benefits.map((benefit, i) => (
              <div
                key={i}
                className="text-center p-6 bg-white rounded-xl shadow-sm"
              >
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  {benefit.icon}
                </div>
                <h3 className="text-lg font-bold text-blue-950 mb-2">
                  {benefit.title}
                </h3>
                <p className="text-gray-600 text-sm">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Plans */}
      <section className="py-16 px-6 md:px-12 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-serif text-blue-950 text-center mb-4">
            Planos de Manutenção
          </h2>
          <p className="text-gray-600 text-center mb-12 max-w-2xl mx-auto">
            Escolha o plano ideal para sua necessidade. Todos incluem equipe
            técnica qualificada e peças de reposição.
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            {plans.map((plan, i) => (
              <div
                key={i}
                className={`bg-white rounded-xl p-8 shadow-sm ${
                  plan.featured ? "ring-2 ring-blue-600 relative" : ""
                }`}
              >
                {plan.featured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-4 py-1 rounded-full">
                    Mais popular
                  </div>
                )}
                <h3 className="text-2xl font-bold text-blue-950 mb-2">
                  {plan.name}
                </h3>
                <p className="text-gray-600 text-sm mb-6">
                  {plan.description}
                </p>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, j) => (
                    <li key={j} className="flex items-start gap-2">
                      <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-700 text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block w-full text-center py-3 rounded-md font-bold transition ${
                    plan.featured
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "bg-gray-100 text-blue-950 hover:bg-gray-200"
                  }`}
                >
                  Solicitar proposta
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      <ContactSection />
    </>
  );
}
