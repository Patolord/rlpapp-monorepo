import { createFileRoute } from "@tanstack/react-router";

import ServicoSection from "@/components/website/ServicoSection";
import ContactSection from "@/components/website/ContactSection";

const WHATSAPP_URL =
  "https://wa.me/5511985782307?text=Olá,%20gostaria%20de%20solicitar%20um%20orçamento";

export const Route = createFileRoute("/_website/servicos")({
  component: ServicosPage,
});

function ServicosPage() {
  return (
    <>
      {/* Hero */}
      <section className="py-16 md:py-24 px-6 md:px-12 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-serif text-blue-950 mb-6">
            Nossos Serviços
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Soluções completas em climatização, refrigeração, pressurização de
            escadas, extração de fumaça e detecção de incêndio.
          </p>
        </div>
      </section>

      <ServicoSection
        id="climatizacao"
        titulo="Climatização"
        imagem="/climatizacao.jpg"
        alt="Sistema de climatização industrial"
        itens={[
          {
            titulo: "Projeto personalizado",
            descricao:
              "Desenvolvemos projetos de climatização sob medida para cada ambiente.",
          },
          {
            titulo: "Instalação completa",
            descricao:
              "Instalação de sistemas VRF, split, chillers e fan coils.",
          },
          {
            titulo: "Eficiência energética",
            descricao:
              "Soluções que reduzem o consumo de energia mantendo o conforto térmico.",
          },
        ]}
        ctaTexto="Solicitar orçamento"
        ctaLink={WHATSAPP_URL}
      />

      <ServicoSection
        id="refrigeracao"
        titulo="Refrigeração"
        imagem="/refrigeracao.jpg"
        alt="Sistema de refrigeração"
        itens={[
          {
            titulo: "Câmaras frigoríficas",
            descricao:
              "Projeto e instalação de câmaras frias para armazenamento.",
          },
          {
            titulo: "Sistemas industriais",
            descricao:
              "Soluções de refrigeração para indústrias e comércios.",
          },
          {
            titulo: "Manutenção preventiva",
            descricao:
              "Contratos de manutenção para garantir o funcionamento contínuo.",
          },
        ]}
        ctaTexto="Solicitar orçamento"
        ctaLink={WHATSAPP_URL}
        reverse
        bg="bg-gray-50"
      />

      <ServicoSection
        id="pressurizacao"
        titulo="Pressurização de Escadas"
        imagem="/pressurizacao.jpeg"
        alt="Sistema de pressurização de escadas"
        itens={[
          {
            titulo: "Conformidade com normas",
            descricao:
              "Atendimento às normas IT 13, NBR 9077 e demais exigências do Corpo de Bombeiros.",
          },
          {
            titulo: "Rotas de fuga seguras",
            descricao:
              "Sistemas que garantem a evacuação segura em caso de incêndio.",
          },
          {
            titulo: "Documentação para AVCB",
            descricao:
              "Laudos técnicos e ARTs para aprovação junto aos órgãos competentes.",
          },
        ]}
        ctaTexto="Solicitar orçamento"
        ctaLink={WHATSAPP_URL}
      />

      <ServicoSection
        id="extracao"
        titulo="Extração de Fumaça"
        imagem="/extracao.png"
        alt="Sistema de extração de fumaça"
        itens={[
          {
            titulo: "Controle de fumaça",
            descricao:
              "Sistemas de exaustão que mantêm a visibilidade e reduzem gases tóxicos.",
          },
          {
            titulo: "Ventilação mecânica",
            descricao:
              "Projetos de ventilação mecânica para garagens e áreas confinadas.",
          },
          {
            titulo: "Integração com alarme",
            descricao:
              "Sistemas integrados com detecção e alarme de incêndio.",
          },
        ]}
        ctaTexto="Solicitar orçamento"
        ctaLink={WHATSAPP_URL}
        reverse
        bg="bg-gray-50"
      />

      <ServicoSection
        id="deteccao"
        titulo="Detecção de Incêndio"
        imagem="/deteccao.jpeg"
        alt="Sistema de detecção de incêndio"
        itens={[
          {
            titulo: "Detecção precoce",
            descricao:
              "Sistemas inteligentes de detecção que identificam riscos antes que se tornem emergências.",
          },
          {
            titulo: "Centrais de alarme",
            descricao:
              "Instalação de centrais de alarme e detecção endereçáveis.",
          },
          {
            titulo: "Manutenção e testes",
            descricao:
              "Testes periódicos e manutenção preventiva para garantir o funcionamento.",
          },
        ]}
        ctaTexto="Solicitar orçamento"
        ctaLink={WHATSAPP_URL}
      />

      <ContactSection />
    </>
  );
}
