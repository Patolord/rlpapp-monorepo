import { useEffect, useState } from "react";
import { getCalApi } from "@calcom/embed-react";
import { FaWhatsapp } from "react-icons/fa";
import { Calendar, X, MessageCircle } from "lucide-react";

export default function FloatingBubbleMenu() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    (async function () {
      const cal = await getCalApi({ namespace: "15min" });
      cal("floatingButton", {
        calLink: "rlpengenharia/15min",
        config: { layout: "month_view" },
        buttonText: "Agendar Reunião",
        buttonColor: "#0071ff",
        hideButtonIcon: true,
      });
      cal("ui", {
        cssVarsPerTheme: {
          light: { "cal-brand": "#0071ff" },
          dark: { "cal-brand": "#0071ff" },
        },
        hideEventTypeDetails: false,
        layout: "month_view",
      });
    })();

    const style = document.createElement("style");
    style.textContent = `[data-cal-namespace="15min"] { display: none !important; }`;
    document.head.appendChild(style);

    return () => {
      style.remove();
    };
  }, []);

  const whatsappNumber = "5511999999999"; // Replace with actual number
  const whatsappMessage = encodeURIComponent(
    "Olá! Gostaria de mais informações sobre os serviços da RLP Engenharia."
  );
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/20 backdrop-blur-sm transition-opacity duration-300 z-40 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setIsOpen(false)}
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
        >
          {/* WhatsApp Button */}
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-3"
            style={{ animationDelay: "50ms" }}
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
              <FaWhatsapp className="w-7 h-7 text-white" />
            </div>
          </a>

          {/* Cal.com Button */}
          <button
            onClick={() => {
              const calButton = document.querySelector(
                '[data-cal-namespace="15min"]'
              ) as HTMLElement;
              if (calButton) calButton.click();
            }}
            className="group flex items-center gap-3"
            style={{ animationDelay: "100ms" }}
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
              <Calendar className="w-6 h-6 text-white" />
            </div>
          </button>
        </div>

        {/* Main Toggle Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`w-16 h-16 rounded-full flex items-center justify-center 
          shadow-xl transition-all duration-300 cursor-pointer
          ${
            isOpen
              ? "bg-gray-800 hover:bg-gray-700 rotate-0"
              : "bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700 hover:scale-110"
          }`}
          style={{
            boxShadow: isOpen
              ? "0 10px 40px rgba(0,0,0,0.3)"
              : "0 10px 40px rgba(59,130,246,0.4)",
          }}
        >
          <div
            className={`transition-transform duration-300 ${
              isOpen ? "rotate-0" : "rotate-0"
            }`}
          >
            {isOpen ? (
              <X className="w-7 h-7 text-white" />
            ) : (
              <MessageCircle className="w-7 h-7 text-white" />
            )}
          </div>
        </button>
      </div>
    </>
  );
}
