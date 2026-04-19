import { useState } from "react";
import { Phone, Mail, X } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import { clsx } from "clsx";

const WHATSAPP_URL =
  "https://wa.me/5511985782307?text=Ol%C3%A1%2C%20gostaria%20de%20solicitar%20um%20or%C3%A7amento";
const PHONE_NUMBER = "tel:+5511985782307";
const EMAIL = "mailto:rlpeng@rlpeng.com.br";

const MENU_ITEMS = [
  {
    href: EMAIL,
    label: "Email",
    icon: Mail,
    bgColor: "bg-blue-600 hover:bg-blue-700",
  },
  {
    href: PHONE_NUMBER,
    label: "Ligar",
    icon: Phone,
    bgColor: "bg-blue-500 hover:bg-blue-600",
  },
  {
    href: WHATSAPP_URL,
    label: "WhatsApp",
    icon: FaWhatsapp,
    bgColor: "bg-green-500 hover:bg-green-600",
    external: true,
  },
] as const;

export default function FloatingBubbleMenu() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
      {MENU_ITEMS.map((item, index) => (
        <a
          key={item.label}
          href={item.href}
          target={item.external ? "_blank" : undefined}
          rel={item.external ? "noopener noreferrer" : undefined}
          aria-label={item.label}
          className={clsx(
            "flex items-center gap-2 rounded-full text-white shadow-lg transition-all duration-200",
            item.bgColor,
            isOpen
              ? "scale-100 opacity-100"
              : "pointer-events-none scale-75 opacity-0",
          )}
          style={{ transitionDelay: isOpen ? `${index * 50}ms` : "0ms" }}
        >
          <span className="flex h-12 w-12 items-center justify-center">
            <item.icon className="h-5 w-5" />
          </span>
        </a>
      ))}

      <button
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={isOpen ? "Fechar menu de contato" : "Abrir menu de contato"}
        className={clsx(
          "flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-all duration-300",
          isOpen
            ? "bg-gray-700 hover:bg-gray-800 rotate-0"
            : "bg-green-500 hover:bg-green-600 rotate-0",
        )}
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <FaWhatsapp className="h-7 w-7" />
        )}
      </button>
    </div>
  );
}
