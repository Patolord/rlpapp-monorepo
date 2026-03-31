import { createFileRoute } from "@tanstack/react-router";

import BenefitsSection from "@/components/website/benefits-section";
import ContactSection from "@/components/website/ContactSection";

export const Route = createFileRoute("/_website/sobre")({
  component: SobrePage,
});

function SobrePage() {
  return (
    <>
      {/* Hero */}
      <section className="py-16 md:py-24 px-6 md:px-12 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-serif text-blue-950 mb-6">
            Sobre a RLP Engenharia
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Há mais de 27 anos no mercado, a RLP Engenharia é referência em
            soluções de climatização, refrigeração, pressurização de escadas e
            proteção contra incêndios.
          </p>
        </div>
      </section>

      <BenefitsSection />

      {/* Mission, Vision, Values */}
      <section className="py-16 px-6 md:px-12 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-xl shadow-sm">
              <h3 className="text-2xl font-serif text-blue-950 mb-4">Missão</h3>
              <p className="text-gray-600">
                Oferecer soluções de engenharia de alta qualidade em climatização
                e segurança contra incêndios, garantindo conforto, segurança e
                eficiência para nossos clientes.
              </p>
            </div>
            <div className="bg-white p-8 rounded-xl shadow-sm">
              <h3 className="text-2xl font-serif text-blue-950 mb-4">Visão</h3>
              <p className="text-gray-600">
                Ser a empresa de referência no mercado nacional em soluções
                integradas de HVAC e proteção contra incêndios, reconhecida pela
                excelência técnica e compromisso com resultados.
              </p>
            </div>
            <div className="bg-white p-8 rounded-xl shadow-sm">
              <h3 className="text-2xl font-serif text-blue-950 mb-4">Valores</h3>
              <p className="text-gray-600">
                Excelência técnica, compromisso com prazos, transparência nas
                relações, inovação constante e respeito ao meio ambiente.
              </p>
            </div>
          </div>
        </div>
      </section>

      <ContactSection />
    </>
  );
}
