"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Users,
  Wrench,
  HardHat,
  ClipboardList,
  Copy,
  Check,
  MessageCircle,
} from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";

const perfis = [
  {
    icon: <HardHat className="w-8 h-8 text-blue-600" />,
    titulo: "Engenheiros",
    descricao:
      "Engenheiros mecânicos e civis especializados em projetos de climatização, refrigeração e proteção contra incêndios.",
  },
  {
    icon: <Wrench className="w-8 h-8 text-blue-600" />,
    titulo: "Técnicos",
    descricao:
      "Técnicos de refrigeração e climatização para instalação e manutenção de sistemas HVAC.",
  },
  {
    icon: <ClipboardList className="w-8 h-8 text-blue-600" />,
    titulo: "Analistas",
    descricao:
      "Profissionais de planejamento, manutenção e controle de qualidade.",
  },
  {
    icon: <Users className="w-8 h-8 text-blue-600" />,
    titulo: "Equipe de Apoio",
    descricao:
      "Ajudantes, auxiliares e profissionais administrativos que garantem o funcionamento da operação.",
  },
];

// Ofuscação para evitar spam bots
const EMAIL_USER = "rlpeng";
const EMAIL_DOMAIN = "rlpeng.com.br";

const WHATSAPP_URL =
  "https://wa.me/5511985782307?text=Olá,%20gostaria%20de%20enviar%20meu%20currículo%20para%20o%20banco%20de%20talentos";

export default function CarreirasPage() {
  const [copied, setCopied] = useState(false);
  const [showEmail, setShowEmail] = useState(false);

  // Email só é montado em runtime (bots não conseguem ver)
  const email = useMemo(() => `${EMAIL_USER}@${EMAIL_DOMAIN}`, []);

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
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="py-10 md:py-16 px-6 md:px-12 bg-gradient-to-b from-gray-100 to-white text-blue-950">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="text-4xl md:text-5xl font-serif mb-6">
                Faça parte da nossa equipe
              </h1>
              <p className="text-xl mb-8 opacity-90">
                Estamos sempre em busca de talentos para integrar nossa equipe e
                contribuir para projetos inovadores em HVAC e proteção contra
                incêndios.
              </p>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-blue-600 text-white px-8 py-4 rounded-md hover:bg-green-700 transition font-bold"
              >
                <FaWhatsapp className="w-6 h-6" />
                Enviar currículo via WhatsApp
              </a>
            </div>
            <div className="relative h-80 md:h-96 rounded-lg overflow-hidden shadow-xl">
              <Image
                src="/oficina.jpg"
                alt="Equipe de profissionais da RLP Engenharia"
                fill
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Perfis Section */}
      <section className="py-10 md:py-16 px-6 md:px-12 bg-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl mb-4 font-serif text-blue-950 text-center">
            Quem trabalha conosco
          </h2>
          <p className="text-gray-600 text-center mb-12">
            Nossa equipe é formada por profissionais qualificados em diversas
            áreas da engenharia e manutenção.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {perfis.map((perfil, index) => (
              <div key={index} className="bg-gray-50 rounded-xl p-6 flex gap-4">
                <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                  {perfil.icon}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-blue-950 mb-1">
                    {perfil.titulo}
                  </h3>
                  <p className="text-gray-600 text-sm">{perfil.descricao}</p>
                </div>
              </div>
            ))}
          </div>

          {/* CTA Principal - WhatsApp */}
          <div className="mt-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-8 text-white text-center">
            <h3 className="text-2xl font-bold mb-4">
              Quer fazer parte do time?
            </h3>
            <p className="mb-6 opacity-90">
              Envie seu currículo pelo WhatsApp.
            </p>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 bg-white text-green-600 px-8 py-4 rounded-md hover:bg-gray-100 transition font-bold text-lg"
            >
              <FaWhatsapp className="w-6 h-6" />
              Enviar currículo
            </a>
            <div className="mt-6 flex items-center justify-center gap-2 text-blue-100">
              <MessageCircle className="w-4 h-4" />
              <span className="text-sm">Resposta em até 2 dias úteis</span>
            </div>
          </div>

          {/* Email alternativo - secundário */}
          <div className="mt-6 bg-gray-50 rounded-xl p-6 text-center">
            <p className="text-gray-600 text-sm mb-3">
              Prefere enviar por e-mail?
            </p>
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
              </div>
            ) : (
              <button
                onClick={() => setShowEmail(true)}
                className="text-blue-600 hover:underline text-sm font-medium"
              >
                Clique para ver o email
              </button>
            )}
            {copied && (
              <p className="text-sm text-green-600 mt-2">Email copiado!</p>
            )}
          </div>

          {/* Info */}
          <div className="mt-8 text-center">
            <Link
              href="/politica-privacidade"
              className="text-sm text-gray-500 hover:text-blue-600 transition"
            >
              Política de Privacidade
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
