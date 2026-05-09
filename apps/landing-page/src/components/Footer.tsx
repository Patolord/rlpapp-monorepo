"use client";

import { useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { MapPinned } from "lucide-react";
import { FaWhatsapp, FaInstagram, FaLinkedinIn } from "react-icons/fa";

// Ofuscação para evitar spam bots
const EMAIL_USER = "rlpeng";
const EMAIL_DOMAIN = "rlpeng.com.br";
const PHONE_NUMBER = "5511985782307";

export default function Footer() {
  // Email e telefone só são montados em runtime (bots não conseguem ver)
  const email = useMemo(() => `${EMAIL_USER}@${EMAIL_DOMAIN}`, []);
  const whatsappLink = useMemo(
    () =>
      `https://wa.me/${PHONE_NUMBER}?text=${encodeURIComponent(
        "Olá, gostaria de solicitar um orçamento"
      )}`,
    []
  );

  return (
    <footer className="py-16 px-6 md:px-12 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          <div>
            {/* Logo and Social Media Container for Mobile */}
            <div className="flex justify-between items-start md:block mb-6">
              <Link href="/">
                <Image
                  src="/logorlp.png"
                  alt="RLP Engenharia Logo"
                  width={150}
                  height={35}
                  className="h-10 w-auto"
                />
              </Link>
              {/* Social Media Icons - Mobile Only */}
              <div className="flex space-x-4 md:hidden">
                <a
                  href="https://www.linkedin.com/company/rlp-engenharia-e-instalações-ltda/?originalSubdomain=br"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-200 hover:bg-blue-100 transition-colors"
                >
                  <FaLinkedinIn className="w-4 h-4 text-blue-800" />
                </a>
                <a
                  href="https://www.instagram.com/rlpengenharia/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-200 hover:bg-blue-100 transition-colors"
                >
                  <FaInstagram className="w-4 h-4 text-blue-800" />
                </a>
              </div>
            </div>
            <p className="text-gray-600 text-sm mb-4">
              Soluções completas em climatização e proteção contra incêndios
              para sua obra.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-blue-900 mb-4">Serviços</h3>
            <ul className="space-y-3">
              <li>
                <Link
                  href="/servicos#climatizacao"
                  className="text-gray-600 hover:text-blue-600 text-sm"
                >
                  Climatização
                </Link>
              </li>
              <li>
                <Link
                  href="/servicos#refrigeracao"
                  className="text-gray-600 hover:text-blue-600 text-sm"
                >
                  Refrigeração
                </Link>
              </li>
              <li>
                <Link
                  href="/servicos#pressurizacao"
                  className="text-gray-600 hover:text-blue-600 text-sm"
                >
                  Pressurização de Escadas
                </Link>
              </li>
              <li>
                <Link
                  href="/servicos#extracao"
                  className="text-gray-600 hover:text-blue-600 text-sm"
                >
                  Extração de Fumaça
                </Link>
              </li>
              <li>
                <Link
                  href="/servicos#deteccao"
                  className="text-gray-600 hover:text-blue-600 text-sm"
                >
                  Detecção de Incêndio
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-blue-900 mb-4">Empresa</h3>
            <ul className="space-y-3">
              <li>
                <Link
                  href="/sobre"
                  className="text-gray-600 hover:text-blue-600 text-sm"
                >
                  Sobre Nós
                </Link>
              </li>
              <li>
                <Link
                  href="/projetos"
                  className="text-gray-600 hover:text-blue-600 text-sm"
                >
                  Projetos
                </Link>
              </li>
              <li>
                <Link
                  href="/carreiras"
                  className="text-gray-600 hover:text-blue-600 text-sm"
                >
                  Carreiras
                </Link>
              </li>
              <li>
                <Link
                  href="/politica-privacidade"
                  className="text-gray-600 hover:text-blue-600 text-sm"
                >
                  Política de Privacidade
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-blue-900 mb-4">Contato</h3>
            <ul className="space-y-3">
              <li>
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-600 hover:text-blue-600 text-sm flex items-center gap-2 font-medium"
                >
                  <FaWhatsapp className="w-4 h-4 text-blue-600" />
                  (11) 98578-2307
                </a>
              </li>
              <li className="text-gray-600 text-sm flex items-center gap-2">
                <span className="text-gray-400">Email:</span>
                <span>{email}</span>
              </li>
              <li className="flex items-start gap-2 text-gray-600 text-sm">
                <MapPinned className="w-4 h-4 text-blue-800 mt-1 flex-shrink-0" />
                <span>
                  Rua Melo Palheta, 172 - Água Branca
                  <br />
                  São Paulo - SP, 05002-030
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Separator */}
        <div className="h-px bg-gray-200 mb-8"></div>

        {/* Copyright and Social Media */}
        <div className="flex flex-col md:flex-row justify-between items-center">
          <p className="text-gray-500 text-sm mb-4 md:mb-0">
            © {new Date().getFullYear()} RLP Engenharia. Todos os direitos reservados.
          </p>
          {/* Social Media Icons - Desktop Only */}
          <div className="hidden md:flex space-x-4">
            <a
              href="https://www.linkedin.com/company/rlp-engenharia-e-instalações-ltda/?originalSubdomain=br"
              target="_blank"
              rel="noopener noreferrer"
              className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-200 hover:bg-blue-100 transition-colors"
            >
              <FaLinkedinIn className="w-4 h-4 text-blue-800" />
            </a>
            <a
              href="https://www.instagram.com/rlpengenharia/"
              target="_blank"
              rel="noopener noreferrer"
              className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-200 hover:bg-blue-100 transition-colors"
            >
              <FaInstagram className="w-4 h-4 text-blue-800" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
