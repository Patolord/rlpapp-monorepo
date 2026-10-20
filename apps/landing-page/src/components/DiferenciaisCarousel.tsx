"use client";

import { useState } from "react";
import { Award, ChevronLeft, ChevronRight } from "lucide-react";

const diferenciais = [
  {
    title: "Expertise Técnica",
    description:
      "Nossa equipe é formada por engenheiros e técnicos altamente qualificados, com certificações nas principais normas e tecnologias do setor.",
  },
  {
    title: "Soluções Personalizadas",
    description:
      "Desenvolvemos projetos sob medida para cada cliente, considerando as especificidades técnicas, orçamentárias e estéticas de cada empreendimento.",
  },
  {
    title: "Tecnologia de Ponta",
    description:
      "Utilizamos as mais avançadas tecnologias e equipamentos do mercado, garantindo eficiência energética e operacional para nossos clientes.",
  },
  {
    title: "Sustentabilidade",
    description:
      "Nossos projetos são desenvolvidos com foco na redução do consumo energético e do impacto ambiental, contribuindo para a sustentabilidade dos empreendimentos.",
  },
  {
    title: "Atendimento Completo",
    description:
      "Oferecemos suporte em todas as etapas do projeto, desde a concepção até a manutenção, garantindo tranquilidade e satisfação para nossos clientes.",
  },
  {
    title: "Conformidade Normativa",
    description:
      "Todos os nossos projetos são desenvolvidos em conformidade com as normas técnicas nacionais e internacionais, garantindo segurança e qualidade.",
  },
];

const PAGE_SIZE = 3;

export default function DiferenciaisCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);

  const nextSlide = () => {
    setCurrentIndex((prevIndex) =>
      prevIndex + PAGE_SIZE >= diferenciais.length ? 0 : prevIndex + PAGE_SIZE
    );
  };

  const prevSlide = () => {
    setCurrentIndex((prevIndex) =>
      prevIndex - PAGE_SIZE < 0
        ? Math.floor((diferenciais.length - 1) / PAGE_SIZE) * PAGE_SIZE
        : prevIndex - PAGE_SIZE
    );
  };

  return (
    <div className="relative">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-12">
        {diferenciais
          .slice(currentIndex, currentIndex + PAGE_SIZE)
          .map((diferencial) => (
            <div key={diferencial.title} className="bg-gray-50 p-6 rounded-xl">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <Award className="w-6 h-6 text-blue-600" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-semibold text-blue-950 font-serif mb-2">
                {diferencial.title}
              </h3>
              <p className="text-gray-600">{diferencial.description}</p>
            </div>
          ))}
      </div>

      <button
        type="button"
        onClick={prevSlide}
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-20 bg-white rounded-full p-2 shadow-md hover:bg-gray-50 transition-colors"
        aria-label="Diferenciais anteriores"
      >
        <ChevronLeft className="w-6 h-6 text-blue-600" aria-hidden="true" />
      </button>

      <button
        type="button"
        onClick={nextSlide}
        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-20 bg-white rounded-full p-2 shadow-md hover:bg-gray-50 transition-colors"
        aria-label="Próximos diferenciais"
      >
        <ChevronRight className="w-6 h-6 text-blue-600" aria-hidden="true" />
      </button>
    </div>
  );
}
