"use client";

import { useMemo } from "react";

// Ofuscação para evitar spam bots
const EMAIL_USER = "rlpeng";
const EMAIL_DOMAIN = "rlpeng.com.br";
const PHONE_NUMBER = "5511985782307";

export default function PoliticaPrivacidadePage() {
  // Email e telefone só são montados em runtime (bots não conseguem ver)
  const email = useMemo(() => `${EMAIL_USER}@${EMAIL_DOMAIN}`, []);
  const whatsappLink = useMemo(
    () => `https://wa.me/${PHONE_NUMBER}`,
    []
  );

  return (
    <div className="min-h-screen bg-gray-50 py-16 px-6 md:px-12">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-sm p-8 md:p-12">
        <h1 className="text-4xl font-serif text-blue-950 mb-8">
          Política de Privacidade
        </h1>

        <p className="text-gray-600 mb-6">
          <strong>Última atualização:</strong> Janeiro de 2026
        </p>

        <div className="prose prose-gray max-w-none">
          <section className="mb-8">
            <h2 className="text-2xl font-serif text-blue-950 mb-4">
              1. Introdução
            </h2>
            <p className="text-gray-600 mb-4">
              A RLP Engenharia e Instalações Ltda. (&quot;RLP Engenharia&quot;,
              &quot;nós&quot; ou &quot;nosso&quot;) está comprometida com a
              proteção da privacidade e dos dados pessoais de nossos clientes,
              parceiros e visitantes do nosso site. Esta Política de Privacidade
              descreve como coletamos, usamos, armazenamos e protegemos suas
              informações pessoais em conformidade com a Lei Geral de Proteção
              de Dados (LGPD - Lei nº 13.709/2018).
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-serif text-blue-950 mb-4">
              2. Dados que Coletamos
            </h2>
            <p className="text-gray-600 mb-4">
              Podemos coletar os seguintes tipos de dados pessoais:
            </p>
            <ul className="list-disc pl-6 text-gray-600 space-y-2">
              <li>
                <strong>Dados de identificação:</strong> nome completo, e-mail,
                telefone
              </li>
              <li>
                <strong>Dados profissionais:</strong> currículo, histórico
                profissional, LinkedIn (para candidatos a vagas)
              </li>
              <li>
                <strong>Dados de navegação:</strong> informações sobre como você
                utiliza nosso site (via cookies e ferramentas de analytics)
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-serif text-blue-950 mb-4">
              3. Finalidade do Tratamento
            </h2>
            <p className="text-gray-600 mb-4">
              Utilizamos seus dados pessoais para as seguintes finalidades:
            </p>
            <ul className="list-disc pl-6 text-gray-600 space-y-2">
              <li>Responder a solicitações de orçamento e contato</li>
              <li>
                Processar candidaturas a vagas de emprego (recrutamento e
                seleção)
              </li>
              <li>Melhorar nossos serviços e experiência do usuário</li>
              <li>Cumprir obrigações legais e regulatórias</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-serif text-blue-950 mb-4">
              4. Base Legal
            </h2>
            <p className="text-gray-600 mb-4">
              O tratamento de dados pessoais pela RLP Engenharia está
              fundamentado nas seguintes bases legais previstas na LGPD:
            </p>
            <ul className="list-disc pl-6 text-gray-600 space-y-2">
              <li>
                <strong>Consentimento:</strong> quando você preenche formulários
                em nosso site
              </li>
              <li>
                <strong>Execução de contrato:</strong> para prestação de
                serviços contratados
              </li>
              <li>
                <strong>Legítimo interesse:</strong> para melhorar nossos
                serviços e comunicações
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-serif text-blue-950 mb-4">
              5. Compartilhamento de Dados
            </h2>
            <p className="text-gray-600 mb-4">
              Não vendemos, alugamos ou compartilhamos seus dados pessoais com
              terceiros para fins de marketing. Podemos compartilhar seus dados
              apenas:
            </p>
            <ul className="list-disc pl-6 text-gray-600 space-y-2">
              <li>Com prestadores de serviços essenciais à nossa operação</li>
              <li>Para cumprir obrigações legais ou ordens judiciais</li>
              <li>Com seu consentimento expresso</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-serif text-blue-950 mb-4">
              6. Segurança dos Dados
            </h2>
            <p className="text-gray-600 mb-4">
              Adotamos medidas técnicas e organizacionais adequadas para
              proteger seus dados pessoais contra acesso não autorizado, perda,
              alteração ou destruição. Isso inclui:
            </p>
            <ul className="list-disc pl-6 text-gray-600 space-y-2">
              <li>Criptografia de dados em trânsito (HTTPS)</li>
              <li>Controle de acesso restrito às informações</li>
              <li>Treinamento de colaboradores sobre proteção de dados</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-serif text-blue-950 mb-4">
              7. Seus Direitos
            </h2>
            <p className="text-gray-600 mb-4">
              De acordo com a LGPD, você tem os seguintes direitos:
            </p>
            <ul className="list-disc pl-6 text-gray-600 space-y-2">
              <li>Confirmar a existência de tratamento de dados</li>
              <li>Acessar seus dados pessoais</li>
              <li>Corrigir dados incompletos, inexatos ou desatualizados</li>
              <li>
                Solicitar a anonimização, bloqueio ou eliminação de dados
                desnecessários
              </li>
              <li>
                Solicitar a portabilidade dos dados a outro fornecedor de
                serviço
              </li>
              <li>Revogar o consentimento a qualquer momento</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-serif text-blue-950 mb-4">
              8. Retenção de Dados
            </h2>
            <p className="text-gray-600 mb-4">
              Mantemos seus dados pessoais pelo tempo necessário para cumprir as
              finalidades para as quais foram coletados, ou conforme exigido por
              lei. Dados de candidatos a vagas são mantidos por até 2 anos após
              o término do processo seletivo, salvo manifestação em contrário.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-serif text-blue-950 mb-4">
              9. Cookies
            </h2>
            <p className="text-gray-600 mb-4">
              Nosso site utiliza cookies para melhorar sua experiência de
              navegação. Cookies são pequenos arquivos de texto armazenados em
              seu dispositivo. Você pode configurar seu navegador para recusar
              cookies, mas isso pode afetar algumas funcionalidades do site.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-serif text-blue-950 mb-4">
              10. Contato do Controlador
            </h2>
            <p className="text-gray-600 mb-4">
              Para exercer seus direitos ou esclarecer dúvidas sobre esta
              Política de Privacidade, entre em contato conosco:
            </p>
            <div className="bg-gray-50 p-6 rounded-lg">
              <p className="text-blue-950 font-semibold mb-2">
                RLP Engenharia e Instalações Ltda.
              </p>
              <p className="text-gray-600">
                Rua Melo Palheta, 172 - Água Branca
                <br />
                São Paulo - SP, 05002-030
              </p>
              <p className="text-gray-600 mt-2">
                <strong>E-mail:</strong>{" "}
                <a
                  href="mailto:rlpeng@rlpeng.com.br"
                  className="text-blue-600 hover:underline"
                >
                  {email}
                </a>
              </p>
              <p className="text-gray-600">
                <strong>WhatsApp:</strong>{" "}
                <a
                  href={whatsappLink}
                  className="text-blue-600 hover:underline"
                >
                  (11) 98578-2307
                </a>
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-serif text-blue-950 mb-4">
              11. Alterações nesta Política
            </h2>
            <p className="text-gray-600">
              Reservamo-nos o direito de atualizar esta Política de Privacidade
              a qualquer momento. Quaisquer alterações serão publicadas nesta
              página com a data de atualização. Recomendamos que você revise
              esta política periodicamente.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
