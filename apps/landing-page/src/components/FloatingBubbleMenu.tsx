"use client";

import { useCallback, useRef, useState } from "react";
import { FaWhatsapp } from "react-icons/fa";
import { Calendar, X, MessageCircle } from "lucide-react";
import { whatsappUrl } from "@/lib/site";

const CAL_NAMESPACE = "15min";
const CAL_LINK = "rlpengenharia/15min";
const CAL_BRAND = "#0071ff";

const WHATSAPP_URL = whatsappUrl(
  "Olá! Gostaria de mais informações sobre os serviços da RLP Engenharia."
);

export default function FloatingBubbleMenu() {
  const [isOpen, setIsOpen] = useState(false);
  // O embed do Cal.com (script de terceiros) só é carregado quando o visitante
  // abre o menu, em vez de em todas as páginas no carregamento inicial.
  const calReady = useRef<Promise<void> | null>(null);

  const ensureCal = useCallback(() => {
    if (!calReady.current) {
      calReady.current = (async () => {
        const { getCalApi } = await import("@calcom/embed-react");
        const cal = await getCalApi({ namespace: CAL_NAMESPACE });
        cal("floatingButton", {
          calLink: CAL_LINK,
          config: { layout: "month_view" },
          buttonText: "Agendar Reunião",
          buttonColor: CAL_BRAND,
          hideButtonIcon: true,
        });
        cal("ui", {
          cssVarsPerTheme: {
            light: { "cal-brand": CAL_BRAND },
            dark: { "cal-brand": CAL_BRAND },
          },
          hideEventTypeDetails: false,
          layout: "month_view",
        });

        // Esconde o botão flutuante padrão do Cal.com (usamos o nosso)
        if (!document.getElementById("cal-floating-button-hide")) {
          const style = document.createElement("style");
          style.id = "cal-floating-button-hide";
          style.textContent = `[data-cal-namespace="${CAL_NAMESPACE}"] { display: none !important; }`;
          document.head.appendChild(style);
        }
      })().catch((error) => {
        calReady.current = null;
        console.warn("[cal.com] não foi possível carregar o agendamento", error);
      });
    }
    return calReady.current;
  }, []);

  const toggleMenu = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next) void ensureCal();
  };

  const openScheduler = async () => {
    await ensureCal();
    const calButton = document.querySelector<HTMLElement>(
      `[data-cal-namespace="${CAL_NAMESPACE}"]`
    );
    calButton?.click();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/20 backdrop-blur-sm transition-opacity duration-300 z-40 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />

      {/* Menu Container */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
        {/* Menu Items */}
        <div
          className={`flex flex-col items-end gap-3 transition-all duration-300 ${
            isOpen
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-4 pointer-events-none"
          }`}
          aria-hidden={!isOpen}
        >
          {/* WhatsApp Button */}
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-3"
            aria-label="Falar com a RLP Engenharia pelo WhatsApp"
            tabIndex={isOpen ? 0 : -1}
          >
            <span
              className={`bg-white px-4 py-2 rounded-full shadow-lg text-sm font-medium text-gray-700 
              opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-2 group-hover:translate-x-0
              whitespace-nowrap`}
            >
              WhatsApp
            </span>
            <div
              className="w-14 h-14 rounded-full bg-gradient-to-br from-green-400 to-green-600 
              flex items-center justify-center shadow-lg shadow-green-500/30
              hover:shadow-xl hover:shadow-green-500/40 hover:scale-110 
              transition-all duration-200 cursor-pointer"
            >
              <FaWhatsapp className="w-7 h-7 text-white" aria-hidden="true" />
            </div>
          </a>

          {/* Cal.com Button */}
          <button
            type="button"
            onClick={() => void openScheduler()}
            className="group flex items-center gap-3"
            aria-label="Agendar reunião com a RLP Engenharia"
            tabIndex={isOpen ? 0 : -1}
          >
            <span
              className={`bg-white px-4 py-2 rounded-full shadow-lg text-sm font-medium text-gray-700 
              opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-2 group-hover:translate-x-0
              whitespace-nowrap`}
            >
              Agendar Reunião
            </span>
            <div
              className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 
              flex items-center justify-center shadow-lg shadow-blue-500/30
              hover:shadow-xl hover:shadow-blue-500/40 hover:scale-110 
              transition-all duration-200 cursor-pointer"
            >
              <Calendar className="w-6 h-6 text-white" aria-hidden="true" />
            </div>
          </button>
        </div>

        {/* Main Toggle Button */}
        <button
          type="button"
          onClick={toggleMenu}
          aria-label={isOpen ? "Fechar opções de contato" : "Abrir opções de contato"}
          aria-expanded={isOpen}
          className={`w-16 h-16 rounded-full flex items-center justify-center 
          shadow-xl transition-all duration-300 cursor-pointer
          ${
            isOpen
              ? "bg-gray-800 hover:bg-gray-700"
              : "bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700 hover:scale-110"
          }`}
          style={{
            boxShadow: isOpen
              ? "0 10px 40px rgba(0,0,0,0.3)"
              : "0 10px 40px rgba(59,130,246,0.4)",
          }}
        >
          {isOpen ? (
            <X className="w-7 h-7 text-white" aria-hidden="true" />
          ) : (
            <MessageCircle className="w-7 h-7 text-white" aria-hidden="true" />
          )}
        </button>
      </div>
    </>
  );
}
