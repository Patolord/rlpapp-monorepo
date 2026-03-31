export default function benefitssection() {
  return (
<section className="py-16 px-6 md:px-12 bg-white ">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center relative">

            <div className="w-full md:w-1/2 mb-8 md:mb-0 relative">
              <div className="relative h-[500px] w-full bg-gray-100">
                <img src="/oficina.jpg" alt="RLP Engenharia" className="absolute inset-0 w-full h-full object-cover rounded-lg" />
              </div>
              <div className="absolute -bottom-4 -left-4 w-[80%] h-[80%] border-l-4 border-b-4 border-blue-600 -z-10"></div>
            </div>

            <div className="w-full md:w-1/2 md:pl-16">
              <div className="flex items-center mb-4">
                <div className="w-12 h-1 bg-blue-600 mr-4"></div>
                <div className="px-4 py-1 border border-gray-300 rounded-full text-gray-700 text-sm font-medium">
                  Desde 1998
                </div>
              </div>

              <h2 className="text-4xl mb-6 text-blue-950 font-serif">Excelência em Engenharia e Compromisso com Resultados</h2>

              <p className="text-gray-600 mb-6 text-justify">
                A RLP Engenharia atua há mais de 27 anos no mercado, oferecendo soluções de alta qualidade em 
                climatização, refrigeração, pressurização de escadas e proteção contra incêndios.
              </p>

              <p className="text-gray-600 mb-12 text-justify">
                Nossa equipe é formada por profissionais altamente qualificados, com vasta experiência no setor e
                comprometimento com a excelência técnica e a satisfação dos clientes.
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="text-blue-600 text-3xl font-bold mb-2">1600+</div>
                  <div className="text-gray-600 text-sm">Projetos Concluídos</div>
                </div>
                <div className="text-center">
                  <div className="text-blue-600 text-3xl font-bold mb-2">27+</div>
                  <div className="text-gray-600 text-sm">Anos de Experiência</div>
                </div>
                <div className="text-center">
                  <div className="text-blue-600 text-3xl font-bold mb-2">40+</div>
                  <div className="text-gray-600 text-sm">Profissionais</div>
                </div>
                <div className="text-center">
                  <div className="text-blue-600 text-3xl font-bold mb-2">98%</div>
                  <div className="text-gray-600 text-sm">Clientes Satisfeitos</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
  )
}
