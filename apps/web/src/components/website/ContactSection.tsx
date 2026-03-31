import { useState, useMemo } from "react";
import {
  Mail,
  MapPinned,
  Clock,
  MessageCircle,
  Copy,
  Check,
} from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";

const EMAIL_USER = "rlpeng";
const EMAIL_DOMAIN = "rlpeng.com.br";
const PHONE_NUMBER = "5511985782307";

export default function ContactSection() {
  const [copied, setCopied] = useState(false);
  const [showEmail, setShowEmail] = useState(false);

  const email = useMemo(() => `${EMAIL_USER}@${EMAIL_DOMAIN}`, []);
  const whatsappLink = useMemo(
    () =>
      `https://wa.me/${PHONE_NUMBER}?text=${encodeURIComponent(
        "Olá, gostaria de solicitar um orçamento"
      )}`,
    []
  );

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = email;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <section id="contato" className="py-10 md:py-20 px-6 md:px-12 bg-white">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h3 className="text-sm text-gray-500 mb-2">Fale Conosco</h3>
          <h2 className="text-4xl font-serif text-blue-950 mb-4">
            Teremos prazer em atendê-lo!
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Entre em contato pelo WhatsApp para uma resposta rápida. Estamos
            prontos para ajudar com seu projeto.
          </p>
        </div>

        {/* WhatsApp Card - Principal */}
        <div className="max-w-lg mx-auto mb-8">
          <a
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            className="group block bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-8 text-white shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02]"
          >
            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                <FaWhatsapp className="w-10 h-10" />
              </div>
            </div>
            <div className="text-center">
              <h3 className="text-2xl font-bold mb-2">WhatsApp</h3>
              <p className="text-3xl font-bold mb-2">(11) 98578-2307</p>
              <div className="flex items-center justify-center gap-2 text-blue-100 mb-4">
                <Clock className="w-4 h-4" />
                <span className="text-sm">Resposta em até 2h</span>
              </div>
              <div className="flex items-center justify-center gap-2 text-white font-medium bg-white/20 rounded-lg py-3 group-hover:bg-white/30 transition">
                <MessageCircle className="w-5 h-5" />
                <span>Iniciar conversa</span>
              </div>
            </div>
          </a>
        </div>

        {/* Email - Secundário */}
        <div className="max-w-lg mx-auto mb-16">
          <div className="bg-gray-50 rounded-xl p-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Mail className="w-5 h-5 text-blue-600" />
              <span className="text-gray-600">Prefere e-mail?</span>
            </div>
            {showEmail ? (
              <div className="flex items-center justify-center gap-3">
                <span className="font-medium text-blue-950">{email}</span>
                <button
                  onClick={copyEmail}
                  className="p-2 bg-blue-100 rounded-md hover:bg-blue-200 transition"
                  title="Copiar email"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4 text-blue-600" />
                  )}
                </button>
                {copied && (
                  <span className="text-sm text-green-600">Copiado!</span>
                )}
              </div>
            ) : (
              <button
                onClick={() => setShowEmail(true)}
                className="text-blue-600 hover:underline font-medium"
              >
                Clique para ver o email
              </button>
            )}
            <p className="text-xs text-gray-500 mt-2">Resposta em até 24h</p>
          </div>
        </div>

        {/* Address Info */}
        <div className="flex flex-col md:flex-row items-center justify-center gap-6 mb-12 text-center md:text-left">
          <div className="flex items-center gap-3 text-gray-600">
            <MapPinned className="w-5 h-5 text-blue-600" />
            <span>
              Rua Melo Palheta, 172 - Água Branca, São Paulo - SP, 05002-030
            </span>
          </div>
        </div>

        {/* Map Section */}
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl mb-8 font-serif text-blue-950 text-center">
            Nossa Localização
          </h2>
          <div className="h-96 bg-gray-200 rounded-xl overflow-hidden shadow-lg">
            <iframe
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3658.0972505373306!2d-46.676382623782004!3d-23.529004360405892!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x94ce57f930af5007%3A0xd0e430e3647abbfb!2sR.%20Melo%20Palheta%2C%20172%20-%20%C3%81gua%20Branca%2C%20S%C3%A3o%20Paulo%20-%20SP%2C%2005002-030!5e0!3m2!1spt-BR!2sbr!4v1745012773693!5m2!1spt-BR!2sbr"
              width="100%"
              height="100%"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            ></iframe>
          </div>
        </div>
      </div>
    </section>
  );
}
