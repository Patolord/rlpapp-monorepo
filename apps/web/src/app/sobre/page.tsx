"use client";

import Image from "next/image";
import { Award, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

export default function SobrePage() {
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

  const [currentIndex, setCurrentIndex] = useState(0);

  const nextSlide = () => {
    setCurrentIndex((prevIndex) =>
      prevIndex + 3 >= diferenciais.length ? 0 : prevIndex + 3
    );
  };

  const prevSlide = () => {
    setCurrentIndex((prevIndex) =>
      prevIndex - 3 < 0
        ? Math.floor(diferenciais.length / 3) * 3
        : prevIndex - 3
    );
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header/Navigation */}

      {/* História da Empresa */}
      <section className="py-20 px-6 md:px-12 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-start">
            <div className="w-full">
              <h2 className="text-5xl text-blue-950 mb-6 font-serif">
                Nossa História
              </h2>
              <p className="text-gray-600 mb-4 text-justify">
                A RLP Engenharia foi fundada em 1998 pelo engenheiro Reinaldo
                Luiz Pellegrini, que identificou uma oportunidade no mercado de
                climatização e proteção contra incêndios. Com sua visão
                inovadora e compromisso com a excelência técnica, a empresa
                iniciou suas atividades em um pequeno apartamento na Zona Norte
                de São Paulo, contando apenas com a sua esposa Andrea
                Pellegrini.
              </p>
              <p className="text-gray-600 mb-4 text-justify">
                Em 2002, uma parceria estratégica foi firmada com o Engenheiro
                Waldemar Monteiro, marcando o início de uma fase de expansão. Ao
                longo dos anos, a RLP Engenharia ampliou sua atuação para
                diversas cidades do estado de São Paulo, como Campinas e
                Guarujá, consolidando-se como referência em soluções de
                engenharia para climatização e segurança. Hoje, nossa carteira
                de clientes inclui algumas das maiores construtoras e
                incorporadoras do estado.
              </p>
              <p className="text-gray-600 mb-8">
                Nossa trajetória é pautada pela busca contínua por inovação
                tecnológica e aprimoramento dos processos, sempre com foco na
                satisfação dos clientes e na sustentabilidade dos projetos.
              </p>

              <div className="mt-10 max-w-6xl mx-auto">
                <div className="bg-gray-50 p-6 rounded-xl flex flex-col md:flex-row items-center gap-6">
                  <div className="w-full md:w-1/2">
                    <div
                      className="relative rounded-lg overflow-hidden"
                      style={{ aspectRatio: "16/9" }}
                    >
                      <Image
                        src="/Diretoria.jpg"
                        alt="Diretores RLP Engenharia"
                        fill
                        className="object-cover"
                      />
                    </div>
                  </div>
                  <div className="w-full md:w-1/2">
                    <h4 className="text-2xl text-blue-950 font-serif mb-10 text-center">
                      Liderança
                    </h4>
                    <p className="text-gray-600 mb-4 text-justify">
                      A RLP Engenharia é liderada por Reinaldo Luiz Pellegrini e
                      Waldemar Monteiro, que juntos somam mais de 50 anos de
                      experiência no setor. Sua visão estratégica e conhecimento
                      técnico são fundamentais para o crescimento sustentável da
                      empresa e para a qualidade dos serviços prestados.
                    </p>
                    <div className="text-center flex flex-col items-center">
                      <div className="flex flex-col sm:flex-row gap-16">
                        <div>
                          <p className="font-semibold text-blue-950 font-serif">
                            Reinaldo Luiz Pellegrini
                          </p>
                          <p className="text-blue-600 text-center *:text-sm">
                            Diretor Comercial
                          </p>
                        </div>
                        <div>
                          <p className="font-semibold text-blue-950 font-serif">
                            Waldemar Monteiro
                          </p>
                          <p className="text-blue-600 text-sm">
                            Diretor Técnico
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Missão e Valores - Agora em tons de azul */}
      <section className="py-12 px-6 md:px-12 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl mb-4 font-serif text-blue-950">
              Nossa Missão
            </h2>
            <div className="flex justify-center">
              <div className="w-16 h-1 bg-blue-500 rounded-full"></div>
              <div className="w-16 h-1 bg-blue-500 rounded-full mx-2"></div>
              <div className="w-16 h-1 bg-blue-500 rounded-full"></div>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row justify-center items-center gap-8 relative">
            {/* Linhas de conexão (visíveis apenas em desktop) */}
            <div className="hidden lg:block absolute top-1/3 left-1/4 w-1/4 border-t-2 border-dashed border-blue-500 z-0"></div>
            <div className="hidden lg:block absolute top-1/3 right-1/4 w-1/4 border-t-2 border-dashed border-blue-500 z-0"></div>

            {/* Missão - Azul Escuro */}
            <div className="relative z-10 w-full lg:w-1/3 flex flex-col items-center">
              <div className="w-72 h-72 rounded-full bg-white shadow-lg flex flex-col items-center justify-center p-6 border-4 border-blue-500">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                  <svg
                    className="w-6 h-6 text-blue-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                    />
                  </svg>
                </div>
                <div className="bg-blue-500 text-white font-bold py-1 px-6 rounded-full mb-3">
                  MISSÃO
                </div>
                <p className="text-gray-600 text-center text-sm">
                  Oferecer soluções inovadoras em climatização e proteção contra
                  incêndios, garantindo conforto, segurança e sustentabilidade.
                </p>
              </div>
            </div>

            {/* Visão - Azul Médio */}
            <div className="relative z-10 w-full lg:w-1/3 flex flex-col items-center lg:mt-16">
              <div className="w-72 h-72 rounded-full bg-white shadow-lg flex flex-col items-center justify-center p-6 border-4 border-blue-500">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                  <svg
                    className="w-6 h-6 text-blue-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                </div>
                <div className="bg-blue-500 text-white font-bold py-1 px-6 rounded-full mb-3">
                  VISÃO
                </div>
                <p className="text-gray-600 text-center text-sm">
                  Ser referência em soluções de engenharia para climatização e
                  proteção contra incêndios no Brasil, líder em inovação e
                  qualidade.
                </p>
              </div>
            </div>

            {/* Valores - Azul Claro */}
            <div className="relative z-10 w-full lg:w-1/3 flex flex-col items-center">
              <div className="w-72 h-72 rounded-full bg-white shadow-lg flex flex-col items-center justify-center p-6 border-4 border-blue-500">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                  <svg
                    className="w-6 h-6 text-blue-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                    />
                  </svg>
                </div>
                <div className="bg-blue-500 text-white font-bold py-1 px-6 rounded-full mb-3">
                  VALORES
                </div>
                <p className="text-gray-600 text-center text-sm">
                  Excelência técnica, inovação constante, compromisso com o
                  cliente, sustentabilidade, ética e transparência.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Diferenciais */}
      <section className="py-16 px-6 md:px-12 bg-white">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl mb-8 text-blue-950 font-serif text-center">
            Nossos Diferenciais
          </h2>
          <div className="relative">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-12">
              {diferenciais
                .slice(currentIndex, currentIndex + 3)
                .map((diferencial, index) => (
                  <div key={index} className="bg-gray-50 p-6 rounded-xl">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                      <Award className="w-6 h-6 text-blue-600" />
                    </div>
                    <h3 className="text-xl font-semibold text-blue-950 font-serif mb-2">
                      {diferencial.title}
                    </h3>
                    <p className="text-gray-600">{diferencial.description}</p>
                  </div>
                ))}
            </div>

            <button
              onClick={prevSlide}
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-20 bg-white rounded-full p-2 shadow-md hover:bg-gray-50 transition-colors"
              aria-label="Previous slide"
            >
              <ChevronLeft className="w-6 h-6 text-blue-600" />
            </button>

            <button
              onClick={nextSlide}
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-20 bg-white rounded-full p-2 shadow-md hover:bg-gray-50 transition-colors"
              aria-label="Next slide"
            >
              <ChevronRight className="w-6 h-6 text-blue-600" />
            </button>
          </div>
        </div>
      </section>

      {/* Conquistas e Resultados
      <section className="py-16 px-6 md:px-12 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl text-blue-950 font-serif mb-12 text-center">
            Conquistas e Certificações
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="text-xl font-semibold mb-6 flex items-center">
                <Award className="w-6 h-6 text-blue-600 mr-2" />
                Certificações
              </h3>
              <ul className="space-y-4">
                <li className=" bg-white p-4 rounded-lg">
                  <h4 className="font-semibold">ISO 9001:2015</h4>
                  <p className="text-gray-600 text-sm">
                    Sistema de Gestão da Qualidade
                  </p>
                </li>
                <li className=" bg-white p-4 rounded-lg">
                  <h4 className="font-semibold">ISO 14001:2015</h4>
                  <p className="text-gray-600 text-sm">
                    Sistema de Gestão Ambiental
                  </p>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-6 flex items-center">
                <Award className="w-6 h-6 text-blue-600 mr-2" />
                Prêmios e Reconhecimentos
              </h3>
              <ul className="space-y-4">
                <li className="bg-white p-4 rounded-lg">
                  <h4 className="font-semibold">
                    Prêmio Master Imobiliário 2019
                  </h4>
                  <p className="text-gray-600 text-sm">
                    Categoria Inovação Tecnológica pelo projeto de climatização
                    do Edifício Platinum Tower
                  </p>
                </li>
                <li className="bg-white p-4 rounded-lg">
                  <h4 className="font-semibold">Selo Verde 2022</h4>
                  <p className="text-gray-600 text-sm">
                    Reconhecimento por práticas sustentáveis em projetos de
                    climatização
                  </p>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      Depoimentos 
      <section className="py-16 px-6 md:px-12">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl mb-12 text-center text-blue-950 font-serif">
            Depoimentos
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-xl shadow-sm">
              <div className="flex items-center mb-4">
                <div className="text-yellow-400 flex">
                  {[...Array(5)].map((_, i) => (
                    <svg
                      key={i}
                      className="w-5 h-5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path>
                    </svg>
                  ))}
                </div>
              </div>
              <p className="text-gray-600 italic mb-4">
                &quot;A RLP Engenharia foi fundamental para o sucesso do nosso
                empreendimento. A equipe técnica demonstrou grande conhecimento
                e comprometimento, entregando soluções eficientes e dentro do
                prazo.&quot;
              </p>
              <div>
                <p className="font-semibold">Ricardo Almeida</p>
                <p className="text-gray-500 text-sm">
                  Diretor de Engenharia, Construtora Alpha
                </p>
              </div>
            </div>
            <div className="bg-white p-8 rounded-xl shadow-sm">
              <div className="flex items-center mb-4">
                <div className="text-yellow-400 flex">
                  {[...Array(5)].map((_, i) => (
                    <svg
                      key={i}
                      className="w-5 h-5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path>
                    </svg>
                  ))}
                </div>
              </div>
              <p className="text-gray-600 italic mb-4">
                &quot;Trabalhamos com a RLP Engenharia em diversos projetos e
                sempre ficamos impressionados com a qualidade técnica e o
                atendimento personalizado. São parceiros de confiança para
                qualquer empreendimento.&quot;
              </p>
              <div>
                <p className="font-semibold">Fernanda Souza</p>
                <p className="text-gray-500 text-sm">
                  Gerente de Projetos, Incorporadora Beta
                </p>
              </div>
            </div>

            <div className="bg-white p-8 rounded-xl shadow-sm">
              <div className="flex items-center mb-4">
                <div className="text-yellow-400 flex">
                  {[...Array(5)].map((_, i) => (
                    <svg
                      key={i}
                      className="w-5 h-5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path>
                    </svg>
                  ))}
                </div>
              </div>
              <p className="text-gray-600 italic mb-4">
                &quot;As soluções de climatização implementadas pela RLP
                Engenharia em nosso centro empresarial resultaram em uma
                economia de energia de 30%. Além da eficiência, o suporte
                técnico contínuo tem sido fundamental para a manutenção do
                desempenho dos sistemas.&quot;
              </p>
              <div>
                <p className="font-semibold">Marcelo Oliveira</p>
                <p className="text-gray-500 text-sm">
                  Diretor de Facilities, Centro Empresarial Gamma
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div> */}
  </div>
  );
}
