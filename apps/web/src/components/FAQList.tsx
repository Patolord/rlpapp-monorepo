import { useState } from "react";

const faqs = [
  {
    question: "Como funciona a contratação de uma equipe de HVAC?",
    answer:
      "É simples e rápido. Você entra em contato, informa o escopo do projeto e o prazo, e montamos uma equipe do tamanho ideal para sua obra. Sem burocracia — podemos iniciar em poucos dias após o alinhamento técnico.",
  },
  {
    question: "Vocês atendem obras de qualquer porte?",
    answer:
      "Sim. Trabalhamos com equipes flexíveis que se adaptam ao tamanho do projeto — desde obras residenciais de alto padrão até grandes empreendimentos comerciais e industriais. Você contrata apenas o que precisa.",
  },
  {
    question: "Quais serviços a RLP executa em obra?",
    answer:
      "Executamos instalação completa de sistemas de climatização (VRF, split, chillers), pressurização de escadas, ventilação mecânica, exaustão e sistemas para aprovação de AVCB. Atuamos do projeto à entrega final.",
  },
  {
    question: "Vocês ajudam na aprovação do AVCB?",
    answer:
      "Sim. Desenvolvemos e executamos os sistemas exigidos pelo Corpo de Bombeiros — pressurização de escadas, detecção de fumaça, ventilação e exaustão — seguindo todas as normas técnicas (NBR 9077, NBR 17240, ITs). Entregamos a documentação necessária para aprovação.",
  },
  {
    question: "Qual o prazo para mobilizar uma equipe?",
    answer:
      "Dependendo da disponibilidade e escopo, conseguimos mobilizar uma equipe em 48 a 72 horas para projetos urgentes. Para obras programadas, fazemos o planejamento junto com seu cronograma para garantir a entrega no prazo.",
  },
  {
    question: "A RLP também faz manutenção após a instalação?",
    answer:
      "Sim. Oferecemos contratos de manutenção preventiva e corretiva para construtoras, administradoras e indústrias. Isso garante a performance dos equipamentos e evita paradas não programadas na operação.",
  },
];

export default function FAQList() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (index: number) =>
    setOpenIndex(index === openIndex ? null : index);

  return (
    <div className="space-y-4">
      {faqs.map((faq, index) => (
        <div key={index}>
          <div
            className="cursor-pointer block p-6 border border-blue-200 hover:border-blue-300 rounded-lg transition duration-200"
            onClick={() => toggle(index)}
          >
            <div className="flex items-center text-blue-950 justify-between">
              <h3 className="font-semibold text-lg">{faq.question}</h3>
              <span
                className={`inline-block transform transition-transform duration-300 ${
                  openIndex === index ? "rotate-90" : "rotate-0"
                }`}
              >
                <svg
                  width="9"
                  height="14"
                  viewBox="0 0 9 14"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M1.5 1.16683L7.33333 7.00016L1.5 12.8335"
                    stroke="#171A1F"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </div>
            <div
              className={`overflow-hidden transition-all duration-500 ease-in-out ${
                openIndex === index ? "mt-6 max-h-[500px]" : "max-h-0"
              }`}
            >
              <p className="tracking-tight text-gray-700">{faq.answer}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
