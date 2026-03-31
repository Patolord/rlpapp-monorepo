import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { ArrowLeft, Calendar, Building, ChevronLeft, ChevronRight, ArrowRight } from "lucide-react"
import type { ProjectType } from "@/lib/types"
import { projectsData } from "@/data/project-data"

export default function ProjectDetail({ project }: { project: ProjectType }) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0)

  const relatedProjects = projectsData.filter((p) => p.category === project.category && p.id !== project.id).slice(0, 3)

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "Climatização":
        return "bg-blue-100 text-blue-800"
      case "Pressurização e Detecção":
      case "Pressurização":
        return "bg-purple-100 text-purple-800"
      case "Detecção de Incêndios":
        return "bg-red-100 text-red-800"
      case "Refrigeração":
        return "bg-cyan-100 text-cyan-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev === (project.galleryImages?.length || 0) - 1 ? 0 : prev + 1))
  }

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev === 0 ? (project.galleryImages?.length || 0) - 1 : prev - 1))
  }

  return (
    <div className="min-h-screen">
      {/* Breadcrumb */}
      <div className="bg-gray-50 py-3 sm:py-4 px-4 sm:px-6 md:px-12">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center text-xs sm:text-sm text-gray-600">
            <Link to="/" className="hover:text-blue-600">
              Início
            </Link>
            <span className="mx-2">/</span>
            <Link to="/projetos" className="hover:text-blue-600">
              Projetos
            </Link>
            <span className="mx-2">/</span>
            <span className="text-gray-900 line-clamp-1">{project.title}</span>
          </div>
        </div>
      </div>

      {/* Project Header */}
      <section className="py-2 sm:py-4 md:py-6 px-4 sm:px-6 md:px-2">
        <div className="max-w-7xl mx-auto">
          <Link to="/projetos" className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-2 sm:mb-3">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar para projetos
          </Link>

          <div className="flex flex-col md:flex-row justify-between items-start gap-2 sm:gap-3 mb-2 sm:mb-3">
            <div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-serif text-blue-950 mb-2 sm:mb-3">{project.title}</h1>
              <div className="flex flex-wrap gap-2 sm:gap-3">
                <span className={`px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium ${getCategoryColor(project.category)}`}>
                  {project.category}
                </span>
                <div className="inline-flex items-center px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium bg-gray-100 text-gray-800">
                  <Calendar className="mr-1 h-3 w-3 sm:h-4 sm:w-4" />
                  {project.year}
                </div>
                {project.client && (
                  <div className="inline-flex items-center px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium bg-gray-100 text-gray-800">
                    <Building className="mr-1 h-3 w-3 sm:h-4 sm:w-4" />
                    {Array.isArray(project.client) ? project.client.join(" / ") : project.client}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Project Gallery */}
      <section className="py-2 sm:py-4 px-4 sm:px-6 md:px-12">
        <div className="max-w-7xl mx-auto">
          <div className="relative aspect-video overflow-hidden rounded-lg shadow-md mb-4 sm:mb-6">
            <img
              src={project.galleryImages?.[currentImageIndex] || project.imageUrl}
              alt={`${project.title} - Imagem ${currentImageIndex + 1}`}
              className="absolute inset-0 w-full h-full object-cover"
            />

            {(project.galleryImages?.length || 0) > 1 && (
              <>
                <button
                  onClick={prevImage}
                  className="absolute left-2 sm:left-4 top-1/2 transform -translate-y-1/2 bg-white/80 p-1.5 sm:p-2 rounded-full shadow-md hover:bg-white transition"
                >
                  <ChevronLeft className="h-4 w-4 sm:h-6 sm:w-6 text-gray-800" />
                </button>
                <button
                  onClick={nextImage}
                  className="absolute right-2 sm:right-4 top-1/2 transform -translate-y-1/2 bg-white/80 p-1.5 sm:p-2 rounded-full shadow-md hover:bg-white transition"
                >
                  <ChevronRight className="h-4 w-4 sm:h-6 sm:w-6 text-gray-800" />
                </button>

                <div className="absolute bottom-2 sm:bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-1.5 sm:space-x-2">
                  {(project.galleryImages || [project.imageUrl]).map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentImageIndex(index)}
                      className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ${currentImageIndex === index ? "bg-white" : "bg-white/50"}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Thumbnails */}
          {(project.galleryImages?.length || 0) > 1 && (
            <div className="grid grid-cols-4 sm:grid-cols-9 gap-1.5 sm:gap-2 mt-2">
              {(project.galleryImages || []).map((image, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentImageIndex(index)}
                  className={`relative aspect-video rounded overflow-hidden ${
                    currentImageIndex === index ? "ring-1 sm:ring-2 ring-blue-500" : ""
                  }`}
                >
                  <img
                    src={image || "/placeholder.svg"}
                    alt={`${project.title} - Thumbnail ${index + 1}`}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Project Details */}
      <section className="py-6 sm:py-8 md:py-12 px-4 sm:px-6 md:px-12">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 md:gap-12">
            <div className="md:col-span-2">
              <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Sobre o projeto</h2>
              <div className="prose max-w-none">
                <p className="text-gray-700 text-sm sm:text-base mb-3 sm:mb-4">{project.description}</p>
                {project.fullDescription && <div dangerouslySetInnerHTML={{ __html: project.fullDescription }} />}
              </div>

              {project.solutions && (
                <div className="mt-6 sm:mt-8">
                  <h3 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">Soluções implementadas</h3>
                  <ul className="space-y-2">
                    {project.solutions.map((solution, index) => (
                      <li key={index} className="flex items-start">
                        <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-600 rounded-full mt-2 mr-2 sm:mr-3"></div>
                        <span className="text-gray-700 text-sm sm:text-base">{solution}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div>
              <div className="bg-gray-50 p-4 sm:p-6 rounded-lg">
                <h3 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">Informações do projeto</h3>
                <ul className="space-y-3 sm:space-y-4">
                  <li className="flex items-start">
                    <span className="font-medium w-24 sm:w-32 text-sm sm:text-base">Cliente:</span>
                    <span className="text-gray-700 text-sm sm:text-base">
                      {Array.isArray(project.client) ? project.client.join(" / ") : (project.client || "Não informado")}
                    </span>
                  </li>
                  <li className="flex items-start">
                    <span className="font-medium w-24 sm:w-32 text-sm sm:text-base">Ano:</span>
                    <span className="text-gray-700 text-sm sm:text-base">{project.year}</span>
                  </li>
                  <li className="flex items-start">
                    <span className="font-medium w-24 sm:w-32 text-sm sm:text-base">Localização:</span>
                    <span className="text-gray-700 text-sm sm:text-base">{project.location || "Não informada"}</span>
                  </li>
                  <li className="flex items-start">
                    <span className="font-medium w-24 sm:w-32 text-sm sm:text-base">Categoria:</span>
                    <span className="text-gray-700 text-sm sm:text-base">{project.category}</span>
                  </li>
                  {project.area && (
                    <li className="flex items-start">
                      <span className="font-medium w-24 sm:w-32 text-sm sm:text-base">Área:</span>
                      <span className="text-gray-700 text-sm sm:text-base">{project.area} m²</span>
                    </li>
                  )}
                  {project.duration && (
                    <li className="flex items-start">
                      <span className="font-medium w-24 sm:w-32 text-sm sm:text-base">Duração:</span>
                      <span className="text-gray-700 text-sm sm:text-base">{project.duration}</span>
                    </li>
                  )}
                </ul>
              </div>

              <div className="mt-6 sm:mt-8">
                <h3 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">Precisa de um projeto similar?</h3>
                <a
                  href="https://wa.me/5511985782307?text=Olá,%20gostaria%20de%20solicitar%20um%20orçamento%20para%20um%20projeto%20similar%20ao%20que%20vi%20no%20site"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full bg-blue-600 text-white text-center py-2.5 sm:py-3 rounded-md hover:bg-blue-700 transition text-sm sm:text-base"
                >
                  Solicitar orçamento
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Related Projects */}
      {relatedProjects.length > 0 && (
        <section className="py-6 sm:py-8 md:py-12 px-4 sm:px-6 md:px-12 bg-gray-50">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 md:mb-8">Projetos relacionados</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
              {relatedProjects.map((relatedProject) => (
                <div
                  key={relatedProject.id}
                  className="bg-white rounded-lg overflow-hidden shadow-md hover:shadow-lg transition duration-300"
                >
                  <div className="relative h-40 sm:h-48">
                    <img
                      src={relatedProject.imageUrl || "/placeholder.svg"}
                      alt={relatedProject.title}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-4 sm:p-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-2 sm:gap-4 mb-3 sm:mb-4">
                      <span
                        className={`px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium ${getCategoryColor(relatedProject.category)}`}
                      >
                        {relatedProject.category}
                      </span>
                      <span className="text-gray-500 text-sm">{relatedProject.year}</span>
                    </div>
                    <h3 className="text-base sm:text-lg font-bold mb-2 sm:mb-3">{relatedProject.title}</h3>
                    <p className="text-gray-600 text-sm sm:text-base mb-3 sm:mb-4 line-clamp-2">{relatedProject.description}</p>
                    <Link
                      to="/projetos/$id"
                      params={{ id: relatedProject.id }}
                      className="inline-flex items-center text-blue-600 hover:text-blue-800 transition text-sm sm:text-base"
                    >
                      Ver detalhes <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
