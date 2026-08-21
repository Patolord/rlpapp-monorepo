import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

const EMAIL_USER = "rlpeng";
const EMAIL_DOMAIN = "rlpeng.com.br";
const PHONE_NUMBER = "5511985782307";

export const Route = createFileRoute("/politica-privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade | RLP Engenharia" },
      {
        name: "description",
        content:
          "Como a RLP Engenharia trata dados pessoais no app e no sistema web, em conformidade com a LGPD.",
      },
      { name: "robots", content: "index, follow" },
    ],
  }),
  component: PoliticaPrivacidadePage,
});

function PoliticaPrivacidadePage() {
  const email = useMemo(() => `${EMAIL_USER}@${EMAIL_DOMAIN}`, []);
  const whatsappLink = useMemo(() => `https://wa.me/${PHONE_NUMBER}`, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-4">
          <img
            src="/logo.jpg"
            alt="RLP Engenharia"
            className="size-10 rounded-lg object-cover"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              RLP Engenharia
            </p>
            <p className="truncate text-sm text-muted-foreground">
              App e sistema de campo
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
        <p className="text-sm text-muted-foreground">
          <Link
            to="/"
            className="text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Voltar ao login
          </Link>
        </p>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
          Política de Privacidade
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Última atualização: 21 de agosto de 2026
        </p>

        <div className="mt-10 space-y-10 text-base leading-relaxed text-foreground">
          <section className="space-y-3">
            <h2 className="text-2xl font-semibold">1. Quem somos</h2>
            <p>
              A RLP Engenharia e Instalações Ltda. (“RLP Engenharia”, “nós”)
              opera o aplicativo móvel RLP Engenharia e o sistema web em{" "}
              <a
                href="https://app.rlpeng.com.br"
                className="text-primary underline-offset-4 hover:underline"
              >
                app.rlpeng.com.br
              </a>
              . Esta política descreve como tratamos dados pessoais de
              colaboradores, operadores e demais usuários autorizados, em
              conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº
              13.709/2018).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold">2. Dados que coletamos</h2>
            <p>Podemos tratar as seguintes categorias de dados:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong>Conta e identificação:</strong> nome, e-mail, nome de
                usuário e dados de autenticação (via Clerk).
              </li>
              <li>
                <strong>Dados profissionais:</strong> cargo, departamento, obras
                e registros de instalação ou manutenção.
              </li>
              <li>
                <strong>Câmera e fotos:</strong> imagens capturadas ou
                selecionadas da galeria para anexar a registros de campo, e
                leitura de QR codes de equipamentos.
              </li>
              <li>
                <strong>Dados de uso:</strong> ações no app e no sistema
                necessárias à operação (por exemplo, movimentações de estoque e
                histórico de equipamentos).
              </li>
            </ul>
            <p>
              Não pedimos localização GPS. O microfone do dispositivo não é
              utilizado.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold">3. Por que usamos esses dados</h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>Autenticar usuários e controlar o acesso ao sistema</li>
              <li>Registrar instalações, manutenções e fotos de campo</li>
              <li>Identificar equipamentos por QR code</li>
              <li>Operar estoque, compras e painéis de obra</li>
              <li>Cumprir obrigações legais e de segurança</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold">4. Permissões do aplicativo</h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong>Câmera:</strong> ler QR codes e fotografar instalações
                ou manutenções.
              </li>
              <li>
                <strong>Galeria / fotos:</strong> anexar imagens já existentes
                aos registros.
              </li>
            </ul>
            <p>
              Essas permissões são opcionais no sistema operacional, mas
              necessárias para as funções de campo correspondentes. Você pode
              revogá-las nas configurações do aparelho.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold">5. Base legal</h2>
            <p>O tratamento se fundamenta, conforme o caso, em:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong>Execução de contrato</strong> ou de procedimentos
                preliminares (prestação do serviço interno)
              </li>
              <li>
                <strong>Legítimo interesse</strong> na operação segura das obras
              </li>
              <li>
                <strong>Obrigação legal</strong> quando a lei exigir retenção
              </li>
              <li>
                <strong>Consentimento</strong> para o uso da câmera e da galeria
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold">6. Compartilhamento</h2>
            <p>
              Não vendemos dados pessoais. Compartilhamos apenas com
              prestadores essenciais à operação, sob contrato:
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li>Clerk, para autenticação</li>
              <li>Convex, para banco de dados e armazenamento de arquivos</li>
              <li>Autoridades, quando houver obrigação legal</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold">7. Segurança e retenção</h2>
            <p>
              Usamos HTTPS, controle de acesso por perfil e armazenamento de
              sessão no dispositivo de forma segura. Os dados ficam retidos
              enquanto a conta estiver ativa e pelo prazo necessário às
              finalidades ou às obrigações legais.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold">8. Seus direitos</h2>
            <p>Nos termos da LGPD, você pode:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>Confirmar a existência de tratamento e acessar seus dados</li>
              <li>Corrigir dados incompletos ou desatualizados</li>
              <li>Solicitar anonimização, bloqueio ou eliminação</li>
              <li>Solicitar portabilidade, quando aplicável</li>
              <li>Revogar o consentimento das permissões do aparelho</li>
              <li>Pedir a exclusão da conta</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold">9. Exclusão de conta</h2>
            <p>
              Para excluir sua conta e os dados associados, envie um pedido para{" "}
              <a
                href={`mailto:${email}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                {email}
              </a>{" "}
              com o assunto “Exclusão de conta — app RLP”. Atenderemos em até 15
              dias, salvo obrigação legal de retenção.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold">10. Contato do controlador</h2>
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <p className="font-semibold">RLP Engenharia e Instalações Ltda.</p>
              <p className="mt-2 text-muted-foreground">
                Rua Melo Palheta, 172 — Água Branca
                <br />
                São Paulo — SP, 05002-030
              </p>
              <p className="mt-3">
                E-mail:{" "}
                <a
                  href={`mailto:${email}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {email}
                </a>
              </p>
              <p>
                WhatsApp:{" "}
                <a
                  href={whatsappLink}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  (11) 98578-2307
                </a>
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold">11. Alterações</h2>
            <p>
              Podemos atualizar esta política a qualquer momento. A versão
              vigente será sempre esta página, com a data de atualização no
              topo. O uso continuado do app após a publicação constitui ciência
              da nova versão.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
