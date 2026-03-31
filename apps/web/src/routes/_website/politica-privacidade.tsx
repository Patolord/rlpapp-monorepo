import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_website/politica-privacidade")({
  component: PoliticaPrivacidadePage,
});

function PoliticaPrivacidadePage() {
  return (
    <section className="py-16 md:py-24 px-6 md:px-12">
      <div className="max-w-4xl mx-auto prose prose-blue">
        <h1 className="text-4xl md:text-5xl font-serif text-blue-950 mb-8">
          Política de Privacidade
        </h1>

        <p className="text-gray-600 mb-8">
          Última atualização: Janeiro de 2025
        </p>

        <h2>1. Informações que coletamos</h2>
        <p>
          A RLP Engenharia coleta informações que você nos fornece diretamente,
          como nome, e-mail, telefone e empresa, quando entra em contato
          conosco através do site, WhatsApp ou outros canais de comunicação.
        </p>

        <h2>2. Como usamos suas informações</h2>
        <p>Utilizamos suas informações para:</p>
        <ul>
          <li>Responder suas solicitações e fornecer orçamentos</li>
          <li>Entrar em contato sobre nossos serviços</li>
          <li>Melhorar nosso site e serviços</li>
          <li>Cumprir obrigações legais</li>
        </ul>

        <h2>3. Compartilhamento de informações</h2>
        <p>
          Não vendemos, alugamos ou compartilhamos suas informações pessoais
          com terceiros, exceto quando necessário para a prestação dos nossos
          serviços ou quando exigido por lei.
        </p>

        <h2>4. Segurança dos dados</h2>
        <p>
          Adotamos medidas de segurança técnicas e organizacionais para
          proteger suas informações contra acesso não autorizado, alteração,
          divulgação ou destruição.
        </p>

        <h2>5. Seus direitos (LGPD)</h2>
        <p>
          De acordo com a Lei Geral de Proteção de Dados (LGPD - Lei nº
          13.709/2018), você tem direito a:
        </p>
        <ul>
          <li>Acessar seus dados pessoais</li>
          <li>Solicitar a correção de dados incompletos ou desatualizados</li>
          <li>Solicitar a exclusão dos seus dados</li>
          <li>Revogar o consentimento para uso dos dados</li>
          <li>Solicitar a portabilidade dos dados</li>
        </ul>

        <h2>6. Cookies</h2>
        <p>
          Nosso site utiliza cookies para melhorar sua experiência de
          navegação. Você pode configurar seu navegador para recusar cookies,
          mas isso pode afetar a funcionalidade do site.
        </p>

        <h2>7. Contato</h2>
        <p>
          Para exercer seus direitos ou esclarecer dúvidas sobre esta
          política, entre em contato conosco:
        </p>
        <ul>
          <li>E-mail: rlpeng@rlpeng.com.br</li>
          <li>Telefone: (11) 98578-2307</li>
          <li>
            Endereço: Rua Melo Palheta, 172 - Água Branca, São Paulo - SP,
            05002-030
          </li>
        </ul>
      </div>
    </section>
  );
}
