import { Star, Clock } from "lucide-react";
import { useRef, useEffect, useState, useMemo } from "react";

const PHONE_NUMBER = "5511985782307";

export default function HeroSection() {
  const carouselRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [isAutoplayPaused, setIsAutoplayPaused] = useState(false);

  const whatsappLink = useMemo(
    () =>
      `https://wa.me/${PHONE_NUMBER}?text=${encodeURIComponent(
        "Olá, preciso de uma equipe de HVAC para minha obra"
      )}`,
    []
  );

  const companyLogos = [
    {
      name: "Tegra Incorporadora",
      logo: "/clientes/Tegra_Incorporadora_Logo_Fundo_Branco1.jpg",
    },
    { name: "C2J Construtora", logo: "/clientes/cliente4.png" },
    { name: "ConstruCompany", logo: "/clientes/CONSTRUCOMPANY.jpg" },
    { name: "Rocontec Construtora", logo: "/clientes/rocontec.png" },
    { name: "Construtora PATRIANI", logo: "/clientes/patrini.png" },
    { name: "Alimonti Construtora", logo: "/clientes/alimonti.jpg" },
    { name: "Peloso Empreendimentos", logo: "/clientes/peloso.png" },
    { name: "EBI Escritorio", logo: "/clientes/ebi.png" },
    { name: "ARCHTECH Construtora", logo: "/clientes/archtech.png" },
    { name: "Exemplar Construtora", logo: "/clientes/exemplar.png" },
    { name: "Eztec Construtora", logo: "/clientes/eztec.png" },
    { name: "Construtora Lopes Kalil", logo: "/clientes/lopeskalil.png" },
    { name: "Drogaria São Paulo", logo: "/clientes/drogariasp.png" },
    { name: "Sky do Brasil", logo: "/clientes/sky.jpeg" },
    { name: "BSL - Brasil Senior Living", logo: "/clientes/bsl.png" },
    { name: "Construtora Duo", logo: "/clientes/duo.jpeg" },
    { name: "Lico's Empreendimentos", logo: "/clientes/lico.png" },
    { name: "Themis Construtora", logo: "/clientes/themis.png" },
    { name: "Construtora Fresno", logo: "/clientes/fresno.jpeg" },
    { name: "Pentagonal Construções", logo: "/clientes/pentagona.png" },
    { name: "Bom Peixe", logo: "/clientes/bompeixelogo.png" },
    { name: "Sadia", logo: "/clientes/sadialogo.png" },
  ];

  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    const calculatePages = () => {
      const containerWidth = carousel.clientWidth;
      const scrollWidth = carousel.scrollWidth;
      const newTotalPages = Math.ceil(scrollWidth / containerWidth);
      setTotalPages(newTotalPages);
    };

    const handleScroll = () => {
      if (!carousel) return;
      const scrollLeft = carousel.scrollLeft;
      const containerWidth = carousel.clientWidth;
      const newCurrentPage = Math.round(scrollLeft / containerWidth);
      setCurrentPage(newCurrentPage);
    };

    const scrollToPage = (page: number) => {
      if (!carousel) return;
      const containerWidth = carousel.clientWidth;
      carousel.scrollTo({
        left: page * containerWidth,
        behavior: "smooth",
      });
    };

    calculatePages();
    carousel.addEventListener("scroll", handleScroll);
    window.addEventListener("resize", calculatePages);

    const interval = setInterval(() => {
      if (!carousel || isAutoplayPaused) return;
      if (
        carousel.scrollLeft >=
        carousel.scrollWidth - carousel.clientWidth - 10
      ) {
        scrollToPage(0);
      } else {
        scrollToPage(currentPage + 1);
      }
    }, 5000);

    return () => {
      carousel.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", calculatePages);
      clearInterval(interval);
    };
  }, [currentPage, isAutoplayPaused]);

  return (
    <section className="pt-10 md:pt-17 pb-6 px-4 bg-gradient-to-b from-gray-50 to-white rounded-b-4xl">
      <div className="container mx-auto">
        <div className="grid md:grid-cols-2 gap-8 items-center">
          <div className="flex flex-col justify-center">
            <div className="inline-block bg-blue-100 text-blue-600 px-4 max-w-[400px] py-1 text-center rounded-full text-sm font-medium mb-6">
              Climatização • AVCB • Pressurização • Ventilação
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif text-blue-950 mb-6">
              Contrate agora uma equipe de HVAC, do tamanho que você precisar
            </h1>
            <p className="text-xl font-sans text-gray-600 mb-8">
              Equipes flexíveis, prontas para entrar na sua obra ou operação.
              Climatização, pressurização, ventilação e AVCB, contratação
              rápida, sem burocracia, para construtoras e indústrias.
            </p>
            <div className="flex flex-wrap gap-4 mb-4">
              <a
                href={whatsappLink}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-blue-600 text-white px-8 py-4 rounded-md hover:bg-blue-700 transition w-full md:w-auto inline-block text-center font-bold text-lg shadow-lg hover:shadow-xl"
              >
                Chamar Equipe Agora
              </a>
              <a
                href="/servicos"
                className="border border-gray-300 text-gray-700 px-8 py-4 rounded-md hover:bg-gray-50 transition w-full md:w-auto inline-block text-center font-bold text-lg shadow-lg hover:shadow-xl"
              >
                Nossos Serviços
              </a>
            </div>
            <div className="flex items-center gap-2 mb-8">
              <Clock className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-700 bg-green-50 px-3 py-1 rounded-full">
                Resposta em até 2h
              </span>
            </div>

            <div className="flex items-center">
              <div className="flex -space-x-2 mr-3">
                {[
                  "/clientes/cliente1.png",
                  "/clientes/cliente2.png",
                  "/clientes/cliente3.png",
                  "/clientes/cliente4.png",
                ].map((src, i) => (
                  <div
                    key={i}
                    className="w-8 h-8 rounded-full border-2 border-white overflow-hidden"
                  >
                    <img
                      src={src}
                      width={32}
                      height={32}
                      alt={`Cliente ${i + 1}`}
                      className="object-cover"
                    />
                  </div>
                ))}
              </div>
              <div>
                <div className="flex text-yellow-400">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className="w-4 h-4 fill-current" />
                  ))}
                </div>
                <p className="text-sm text-gray-600">
                  +300 obras entregues no prazo
                </p>
              </div>
            </div>
          </div>
          <div className="h-full flex items-center justify-center">
            <div className="relative w-full h-[400px] md:h-[500px]">
              <img
                src="/technician2.jpeg"
                alt="Técnico da RLP Engenharia realizando manutenção em sistema de ar condicionado"
                className="absolute inset-0 w-full h-full object-cover rounded-lg"
              />
            </div>
          </div>
        </div>

        {/* Company logos carousel */}
        <div className="mt-16">
          <div className="relative">
            <div
              ref={carouselRef}
              className="flex overflow-x-auto scrollbar-hide gap-6 py-4 px-4"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              {companyLogos.map((company, index) => (
                <div
                  key={index}
                  className="flex-shrink-0 flex items-center bg-white hover:bg-blue-500 transition-all duration-300 rounded-full px-4 py-2 border border-gray-200 shadow-sm hover:shadow-lg min-w-[200px] cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center bg-gray-50">
                    <img
                      src={company.logo || "/placeholder.svg"}
                      alt={company.name}
                      width={40}
                      height={40}
                    />
                  </div>
                  <span className="ml-3 text-sm font-medium text-gray-700 group-hover:text-white transition-all duration-300">
                    {company.name}
                  </span>
                </div>
              ))}
            </div>

            {/* Pagination dots */}
            <div className="flex justify-center gap-2 mt-4">
              {Array.from({ length: totalPages }).map((_, index) => (
                <button
                  key={index}
                  onClick={() => {
                    const carousel = carouselRef.current;
                    if (!carousel) return;
                    const containerWidth = carousel.clientWidth;
                    carousel.scrollTo({
                      left: index * containerWidth,
                      behavior: "smooth",
                    });
                    setIsAutoplayPaused(true);
                    setTimeout(() => setIsAutoplayPaused(false), 10000);
                  }}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    currentPage === index
                      ? "bg-blue-600 scale-125"
                      : "bg-gray-300 hover:bg-gray-400"
                  }`}
                  aria-label={`Go to slide ${index + 1}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
