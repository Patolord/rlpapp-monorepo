import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Layers,
  AlarmSmoke,
  Wind,
  ThermometerSnowflake,
  Fan,
} from "lucide-react";

export default function ServicosPage() {
  const mainServices = [
    {
      id: "climatizacao",
      title: "Climatização",
      description:
        "Projetos personalizados de climatização para ambientes comerciais, industriais e residenciais.",
      icon: <Wind className="w-8 h-8 text-blue-600" />,
      image: "/climatizacao.jpg",
    },
    {
      id: "refrigeracao",
      title: "Refrigeração",
      description:
        "Soluções em refrigeração para preservar ambiente, produtos e equipamentos com eficiência energética e confiabilidade.",
      icon: <ThermometerSnowflake className="w-8 h-8 text-blue-600" />,
      image: "/refrigeracao.jpg",
    },
    {
      id: "pressurizacao",
      title: "Pressurização de Escadas",
      description:
        "Sistemas que garantem rotas de fuga seguras em caso de incêndio, atendendo às normas técnicas.",
      icon: <Layers className="w-8 h-8 text-blue-600" />,
      image: "/pressurizacao.jpeg",
    },
    {
      id: "deteccao",
      title: "Detecção",
      description:
        "Sistemas inteligentes que identificam precocemente situações de risco, protegendo vidas e patrimônio.",
      icon: <AlarmSmoke className="w-8 h-8 text-blue-600" />,
      image: "/deteccao.jpeg",
    },
    {
      id: "extracao",
      title: "Extração de Fumaça",
      description:
        "Sistemas de exaustão e controle de fumaça para garantir a segurança e visibilidade em situações de emergência.",
      icon: <Fan className="w-8 h-8 text-blue-600" />,
      image: "/extracao.png",
    },
  ];

  return (
    <div className="flex flex-col bg-gray-50 rounded-b-4xl">
      <section className="py-8 md:py-12 lg:py-20 px-4 sm:px-6 md:px-8 lg:px-24">
        <div className="w-full">
          <h1 className="text-3xl md:text-4xl text-center mb-8 md:mb-12 lg:mb-20 text-blue-950 font-serif">
            Nossos Serviços
          </h1>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 md:gap-8 max-w-[95%] sm:max-w-[90%] lg:max-w-full mx-auto">
            {mainServices.map((service) => (
              <Link
                key={service.id}
                to="/servicos"
                hash={service.id}
                className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-lg transition-all duration-300 flex flex-col h-full"
              >
                <div className="relative h-40 sm:h-44 md:h-48">
                  <img
                    src={service.image || "/placeholder.svg"}
                    alt={service.title}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                </div>
                <div className="p-4 sm:p-5 md:p-6 flex flex-col flex-grow">
                  <div className="flex items-start gap-3 mb-3 md:mb-4">
                    <div className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-blue-50 rounded-full flex-shrink-0">
                      {service.icon}
                    </div>
                    <h2 className="text-lg md:text-xl font-bold text-blue-950 leading-tight">
                      {service.title}
                    </h2>
                  </div>
                  <p className="text-sm md:text-base text-gray-600 mb-4 flex-grow">
                    {service.description}
                  </p>
                  <div className="inline-flex items-center text-blue-600 font-medium hover:text-blue-800 text-sm md:text-base">
                    Saiba mais
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
