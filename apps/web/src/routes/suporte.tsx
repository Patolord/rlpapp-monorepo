import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { WhatsAppContactButton } from "@/components/whatsapp-contact-button";

const EMAIL_USER = "rlpeng";
const EMAIL_DOMAIN = "rlpeng.com.br";
const BUNDLE_ID = "com.upcraft.rlpapp";

export const Route = createFileRoute("/suporte")({
  head: () => ({
    meta: [
      { title: "Suporte | RLP Engenharia" },
      {
        name: "description",
        content:
          "Suporte do app RLP Engenharia (iOS e Android): contato, acesso, senha e problemas no aplicativo.",
      },
      { name: "robots", content: "index, follow" },
    ],
  }),
  component: SuportePage,
});

function SuportePage() {
  const email = useMemo(() => `${EMAIL_USER}@${EMAIL_DOMAIN}`, []);

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
          Suporte
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Ajuda para o aplicativo RLP Engenharia em iOS e Android.
        </p>

        <div className="mt-10 space-y-10 text-base leading-relaxed text-foreground">
          <section className="space-y-3">
            <h2 className="text-2xl font-semibold">Sobre o aplicativo</h2>
            <p>
              O app RLP Engenharia é o aplicativo móvel da RLP Engenharia e
              Instalações Ltda. para registro de instalação e manutenção de
              equipamentos em campo. Está disponível para iOS e Android.
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong>Plataformas:</strong> iOS e Android
              </li>
              <li>
                <strong>Identificador do app (bundle):</strong>{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
                  {BUNDLE_ID}
                </code>
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold">Contato</h2>
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <p className="font-semibold">RLP Engenharia e Instalações Ltda.</p>
              <p className="mt-2 text-muted-foreground">
                Rua Melo Palheta, 172 — Água Branca
                <br />
                São Paulo/SP
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
              <p className="mt-3">
                <WhatsAppContactButton />
              </p>
            </div>
          </section>

          <section className="space-y-6">
            <h2 className="text-2xl font-semibold">Perguntas frequentes</h2>

            <div className="space-y-3">
              <h3 className="text-xl font-semibold">Acesso e login</h3>
              <p>
                Não há cadastro público. As contas são criadas pela RLP
                Engenharia para funcionários e usuários autorizados. Se você
                precisa de acesso, fale com o responsável da sua equipe ou
                entre em contato pelos canais acima.
              </p>
            </div>

            <div className="space-y-3">
              <h3 className="text-xl font-semibold">Esqueci a senha</h3>
              <p>
                Solicite a redefinição da senha pelo e-mail{" "}
                <a
                  href={`mailto:${email}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {email}
                </a>{" "}
                ou pelo WhatsApp. Informe o nome de usuário ou o e-mail da
                conta para que possamos localizá-la.
              </p>
            </div>

            <div className="space-y-3">
              <h3 className="text-xl font-semibold">Problemas no app</h3>
              <p>
                Se o aplicativo não abre, trava ou alguma função falha, descreva
                o ocorrido por e-mail ou WhatsApp. Inclua, se possível, o
                modelo do aparelho, a versão do sistema (iOS ou Android) e
                capturas de tela.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold">Outras páginas</h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <Link
                  to="/politica-privacidade"
                  className="text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Política de Privacidade
                </Link>
              </li>
              <li>
                <Link
                  to="/excluir-conta"
                  className="text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Exclusão de conta e dados
                </Link>
              </li>
            </ul>
          </section>
        </div>
      </main>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-3xl flex-wrap gap-x-6 gap-y-2 px-6 py-4 text-sm text-muted-foreground">
          <Link
            to="/politica-privacidade"
            className="text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Política de Privacidade
          </Link>
          <Link
            to="/excluir-conta"
            className="text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Exclusão de conta
          </Link>
        </div>
      </footer>
    </div>
  );
}
