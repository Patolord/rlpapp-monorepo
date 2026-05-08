import Image from "next/image"
import { ArrowRight, CheckCircle } from "lucide-react"

interface Item {
  titulo: string
  descricao: string
}

interface Props {
  id: string
  titulo: string
  imagem: string
  alt: string
  itens: Item[]
  ctaTexto: string
  ctaLink: string
  bg?: string
  reverse?: boolean
  corBotao?: "primario" | "secundario"
}

export default function ServicoSection({
  id,
  titulo,
  imagem,
  alt,
  itens,
  ctaTexto,
  ctaLink,
  bg = "bg-white",
  reverse = false,
  corBotao = "primario",
}: Props) {
  return (
    <section id={id} className={`py-10 md:py-16 px-6 md:px-12 ${bg}`}>
      <div className="max-w-7xl mx-auto">
        <div
          className={`grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center ${
            reverse
              ? "md:[&>*:first-child]:order-2 md:[&>*:last-child]:order-1"
              : ""
          }`}
        >
          <div>
            <Image
              src={imagem}
              alt={alt}
              width={600}
              height={600}
              className="rounded-lg object-cover w-full h-auto aspect-square"
            />
          </div>
          <div>
            <h2 className="text-4xl mb-4 font-serif text-blue-950 text-center">{titulo}</h2>
            <div className="w-24 h-0.5 bg-blue-900 mx-auto mb-10"></div>

            <div className="space-y-6 mb-8">
              {itens.map((item, index) => (
                <div key={index} className="flex items-start">
                  <CheckCircle className="text-blue-600 w-6 h-6 mt-1 mr-3 flex-shrink-0" />
                  <div>
                    <h3 className="text-xl font-semibold mb-2 text-blue-950">{item.titulo}</h3>
                    <p className="text-gray-600 mb-1">{item.descricao}</p>
                  </div>
                </div>
              ))}
            </div>

            <a
              href={ctaLink}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center px-6 py-3 rounded-md transition ${
                corBotao === "primario"
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "bg-white text-blue-600 border border-blue-600 hover:bg-blue-50"
              }`}
            >
              {ctaTexto}
              <ArrowRight className="ml-2 w-5 h-5" />
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}