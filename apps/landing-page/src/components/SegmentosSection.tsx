"use client";

import Image from "next/image";
import Link from "next/link";
import { Building2, Home, ArrowRight, Wrench, HardHat } from "lucide-react";

export default function SegmentosSection() {
  return (
    <section className="py-16 px-6 md:px-12 bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-serif text-blue-950 mb-4">
            Atendemos quem constrói e quem opera
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Soluções completas em HVAC e segurança contra incêndio, da
            instalação à manutenção contínua.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
          {/* Construtoras */}
          <div className="group relative bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-600/90 to-blue-800/90 z-10"></div>
            <Image
              src="/hero.jpg"
              alt="Obra de construção"
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-500"
            />
            <div className="relative z-20 p-8 md:p-10 h-full flex flex-col justify-between min-h-[420px]">
              <div>
                <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center mb-6">
                  <HardHat className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl md:text-3xl font-bold text-white mb-4">
                  Construtoras & Incorporadoras
                </h3>
                <p className="text-blue-100 text-lg mb-6">
                  Equipes flexíveis para instalação de sistemas de climatização,
                  pressurização e AVCB. Mobilização rápida, execução no prazo.
                </p>
                <ul className="space-y-2 text-white/90 mb-8">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-blue-300 rounded-full"></span>
                    Instalação de VRF, splits e chillers
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-blue-300 rounded-full"></span>
                    Pressurização de escadas (IT 13)
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-blue-300 rounded-full"></span>
                    Detecção e alarme de incêndio
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-blue-300 rounded-full"></span>
                    Documentação para AVCB
                  </li>
                </ul>
              </div>
              <Link
                href="/servicos"
                className="inline-flex items-center gap-2 bg-white text-blue-600 hover:bg-blue-50 px-6 py-3 rounded-lg font-bold transition-colors w-fit"
              >
                Ver serviços de instalação
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </div>

          {/* Condomínios */}
          <div className="group relative bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/90 to-emerald-800/90 z-10"></div>
            <Image
              src="/oficina.jpg"
              alt="Manutenção em condomínio"
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-500"
            />
            <div className="relative z-20 p-8 md:p-10 h-full flex flex-col justify-between min-h-[420px]">
              <div>
                <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center mb-6">
                  <Wrench className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl md:text-3xl font-bold text-white mb-4">
                  Condomínios & Administradoras
                </h3>
                <p className="text-emerald-100 text-lg mb-6">
                  Contratos de manutenção preventiva e corretiva. Atendimento
                  rápido, laudos para AVCB e tranquilidade para síndicos.
                </p>
                <ul className="space-y-2 text-white/90 mb-8">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-emerald-300 rounded-full"></span>
                    Manutenção preventiva mensal
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-emerald-300 rounded-full"></span>
                    Atendimento emergencial 24/7
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-emerald-300 rounded-full"></span>
                    Teste periódico de segurança
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-emerald-300 rounded-full"></span>
                    Laudos técnicos e ARTs
                  </li>
                </ul>
              </div>
              <Link
                href="/manutencao"
                className="inline-flex items-center gap-2 bg-white text-emerald-600 hover:bg-emerald-50 px-6 py-3 rounded-lg font-bold transition-colors w-fit"
              >
                Ver planos de manutenção
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="text-center p-6 bg-white rounded-xl shadow-sm">
            <div className="text-3xl md:text-4xl font-bold text-blue-600 mb-1">
              300+
            </div>
            <div className="text-gray-600 text-sm">Obras entregues</div>
          </div>
          <div className="text-center p-6 bg-white rounded-xl shadow-sm">
            <div className="text-3xl md:text-4xl font-bold text-blue-600 mb-1">
              500+
            </div>
            <div className="text-gray-600 text-sm">Condomínios atendidos</div>
          </div>
          <div className="text-center p-6 bg-white rounded-xl shadow-sm">
            <div className="text-3xl md:text-4xl font-bold text-blue-600 mb-1">
              27
            </div>
            <div className="text-gray-600 text-sm">Anos de experiência</div>
          </div>
          <div className="text-center p-6 bg-white rounded-xl shadow-sm">
            <div className="text-3xl md:text-4xl font-bold text-blue-600 mb-1">
              98%
            </div>
            <div className="text-gray-600 text-sm">Clientes satisfeitos</div>
          </div>
        </div>
      </div>
    </section>
  );
}
