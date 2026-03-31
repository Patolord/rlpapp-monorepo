import { createFileRoute } from "@tanstack/react-router";
import { Briefcase, Users, TrendingUp, Heart, ArrowRight } from "lucide-react";

import ContactSection from "@/components/website/ContactSection";

const WHATSAPP_URL =
  "https://wa.me/5511985782307?text=Olá,%20gostaria%20de%20saber%20sobre%20oportunidades%20na%20RLP%20Engenharia";

export const Route = createFileRoute("/_website/carreiras")({
  component: CarreirasPage,
});

function CarreirasPage() {
  const values = [
    {
      icon: <Briefcase className="w-8 h-8 text-blue-600" />,
      title: "Crescimento profissional",
      description:
        "Investimos no desenvolvimento contínuo dos nossos colaboradores com treinamentos e certificações.",
    },
    {
      icon: <Users className="w-8 h-8 text-blue-600" />,
      title: "Equipe colaborativa",
      description:
        "Trabalhamos em equipe, valorizando a troca de conhecimento e a colaboração.",
    },
    {
      icon: <TrendingUp className="w-8 h-8 text-blue-600" />,
      title: "Projetos desafiadores",
      description:
        "Atue em projetos de grande porte para construtoras e indústrias de destaque no mercado.",
    },
    {
      icon: <Heart className="w-8 h-8 text-blue-600" />,
      title: "Qualidade de vida",
      description:
        "Valorizamos o equilíbrio entre vida pessoal e profissional dos nossos colaboradores.",
    },
  ];

  return (
    <>
      {/* Hero */}
      <section className="py-16 md:py-24 px-6 md:px-12 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-serif text-blue-950 mb-6">
            Trabalhe na RLP Engenharia
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
            Faça parte de uma equipe com mais de 27 anos de experiência em
            engenharia. Estamos sempre em busca de profissionais talentosos e
            comprometidos.
          </p>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center bg-blue-600 text-white px-8 py-4 rounded-md hover:bg-blue-700 transition font-bold text-lg"
          >
            Enviar currículo
            <ArrowRight className="ml-2 w-5 h-5" />
          </a>
        </div>
      </section>

      {/* Values */}
      <section className="py-16 px-6 md:px-12">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-serif text-blue-950 text-center mb-12">
            Por que trabalhar conosco?
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {values.map((value, i) => (
              <div
                key={i}
                className="text-center p-6 bg-white rounded-xl shadow-sm"
              >
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  {value.icon}
                </div>
                <h3 className="text-lg font-bold text-blue-950 mb-2">
                  {value.title}
                </h3>
                <p className="text-gray-600 text-sm">{value.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-6 md:px-12 bg-blue-600 text-white">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">
            Não encontrou sua vaga?
          </h2>
          <p className="text-xl mb-8 opacity-90">
            Envie seu currículo pelo WhatsApp. Estamos sempre avaliando novos
            talentos para nossa equipe.
          </p>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center bg-white text-blue-600 px-8 py-4 rounded-md hover:bg-gray-100 transition font-bold text-lg"
          >
            Enviar currículo via WhatsApp
            <ArrowRight className="ml-2 w-5 h-5" />
          </a>
        </div>
      </section>

      <ContactSection />
    </>
  );
}
