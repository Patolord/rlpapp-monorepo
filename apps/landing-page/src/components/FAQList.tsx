import { useState } from "react";
import { faqs } from "@/data/faq-data";

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
