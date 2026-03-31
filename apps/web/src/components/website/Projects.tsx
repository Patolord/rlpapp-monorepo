import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

const projects = [
    {
      id: "brasilia-square-offices",
      title: "Brasília Square Offices",
      category: "Pressurização e Extração",
      description:
        "Sistema de pressurização de escadas e extração de fumaça para garantir a segurança e evacuação em situações de emergência.",
      image: "/projetos/brasilia1.png",
      year: "2020",
    },
    {
      id: "bom-peixe",
      title: "Bom Peixe",
      category: "Refrigeração",
      description:
        "Sistema de refrigeração com câmaras frigoríficas e sistema de amônia para armazenamento e processamento de pescados.",
      image: "/projetos/bompeixe1.png",
      year: "2010",
    },
    {
      id: "condominio-bem-moema",
      title: "Condomínio Bem Moema",
      category: "Climatização e Pressurização",
      description: "Sistema de climatização central e pressurização de escadas para garantir conforto térmico e segurança em situações de emergência.",
      image: "/projetos/bemmoema1.png",
      year: "2025",
    },
    {
      id: "sirius-campinas-patriani",
      title: "Sirius Campinas Patriani",
      category: "Climatização e Pressurização",
      description: "Sistema de climatização central e pressurização de escadas para garantir conforto térmico e segurança em situações de emergência.",
      image: "/projetos/sirius1.png",
      year: "2023",
    },
  ]

export default function Projects() {
    return (
      <section className="py-12 px-8 md:px-12">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl mb-8 text-blue-950 font-serif">Nossos Projetos</h2>
            <p className="text-gray-600 max-w-4xl mx-auto">
              Conheça alguns dos nossos principais projetos realizados para clientes de diversos segmentos, demonstrando
              nossa expertise e capacidade técnica.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-20 gap-y-12 max-w-[90%] mx-auto md:max-w-full">
            {projects.map((project) => (
              <div key={project.id} className="bg-gray-50 rounded-xl overflow-hidden flex flex-col md:flex-row">
                <div className="md:w-2/5 relative h-64 md:h-auto">
                  <img src={project.image || "/placeholder.svg"} alt={project.title} className="absolute inset-0 w-full h-full object-cover" />
                </div>
                <div className="md:w-3/5 p-6">
                  <div className="flex justify-between items-start mb-2">
                    <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                      {project.category}
                    </span>
                    <span className="text-gray-500 text-sm">{project.year}</span>
                  </div>
                  <h3 className="text-xl font-bold mb-2">{project.title}</h3>
                  <p className="text-gray-600 mb-4">{project.description}</p>
                  <Link to="/projetos/$id" params={{ id: project.id }} className="inline-flex items-center text-blue-600 font-medium hover:text-blue-800">
                    Ver detalhes
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Link
              to="/projetos"
              className="inline-flex items-center justify-center bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 transition"
            >
              Ver todos os projetos
              <ArrowRight className="ml-2 w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>
    )
}
