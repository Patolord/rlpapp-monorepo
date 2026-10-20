"use client";

import { useState } from "react";
import { homeFaqs } from "@/data/faq";

export default function FAQList() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (index: number) =>
    setOpenIndex(index === openIndex ? null : index);

  return (
    <div className="space-y-4">
      {homeFaqs.map((faq, index) => {
        const isOpen = openIndex === index;
        const panelId = `faq-panel-${index}`;
        return (
          <div key={index}>
            <div className="block p-6 border border-blue-200 hover:border-blue-300 rounded-lg transition duration-200">
              <h3 className="font-semibold text-lg text-blue-950">
                <button
                  type="button"
                  onClick={() => toggle(index)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  className="w-full flex items-center justify-between gap-4 text-left cursor-pointer"
                >
                  <span>{faq.question}</span>
                  <span
                    className={`inline-block transform transition-transform duration-300 ${
                      isOpen ? "rotate-90" : "rotate-0"
                    }`}
                    aria-hidden="true"
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
                </button>
              </h3>
              <div
                id={panelId}
                className={`overflow-hidden transition-all duration-500 ease-in-out ${
                  isOpen ? "mt-6 max-h-[500px]" : "max-h-0"
                }`}
              >
                <p className="tracking-tight text-gray-700">{faq.answer}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
