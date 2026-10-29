import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

const EMAIL_USER = "rlpeng";
const EMAIL_DOMAIN = "rlpeng.com.br";
const DELETE_SUBJECT = "Exclusão de conta — app RLP";

export const Route = createFileRoute("/excluir-conta")({
  head: () => ({
    meta: [
      { title: "Exclusão de conta | RLP Engenharia" },
      {
        name: "description",
        content:
          "Como pedir a exclusão da conta e dos dados pessoais no app RLP Engenharia, em conformidade com a política de privacidade e a LGPD.",
      },
      { name: "robots", content: "index, follow" },
    ],
  }),
  component: ExcluirContaPage,
});

function ExcluirContaPage() {
  const email = useMemo(() => `${EMAIL_USER}@${EMAIL_DOMAIN}`, []);
  const mailto = useMemo(() => {
    const subject = encodeURIComponent(DELETE_SUBJECT);
    return `mailto:${email}?subject=${subject}`;
  }, [email]);

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
          Exclusão de conta e dados
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Pedido de exclusão da conta no app RLP Engenharia e dos dados
          associados, nos termos da{" "}
          <Link
            to="/politica-privacidade"
            className="text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Política de Privacidade
          </Link>
          .
        </p>

        <div className="mt-10 space-y-10 text-base leading-relaxed text-foreground">
          <section className="space-y-3">
            <h2 className="text-2xl font-semibold">Como pedir a exclusão</h2>
            <p>
              Para excluir sua conta e os dados associados, envie um pedido
              para{" "}
              <a
                href={mailto}
                className="text-primary underline-offset-4 hover:underline"
              >
                {email}
              </a>{" "}
              com o assunto “{DELETE_SUBJECT}”. Atenderemos em até 15 dias,
              salvo obrigação legal de retenção.
            </p>
            <ol className="list-decimal space-y-2 pl-6">
              <li>
                Abra um e-mail para{" "}
                <a
                  href={mailto}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {email}
                </a>
                .
              </li>
              <li>Use o assunto “{DELETE_SUBJECT}”.</li>
              <li>
                Informe o nome de usuário ou o e-mail da conta para que
                possamos identificá-la.
              </li>
              <li>
                Aguarde o atendimento em até 15 dias, salvo obrigação legal de
                retenção.
              </li>
            </ol>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold">Quais dados são apagados</h2>
            <p>
              O pedido cobre a conta e os dados associados tratados no app e no
              sistema web, nas categorias descritas na política de privacidade:
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong>Conta e identificação:</strong> nome, e-mail, nome de
                usuário e dados de autenticação.
              </li>
              <li>
                <strong>Dados profissionais</strong> vinculados à conta (cargo,
                departamento, obras e registros de instalação ou manutenção),
                quando não houver obrigação legal de retenção.
              </li>
              <li>
                <strong>Câmera e fotos</strong> anexadas aos seus registros,
                quando não houver obrigação legal de retenção.
              </li>
              <li>
                <strong>Dados de uso</strong> da conta no app e no sistema.
              </li>
            </ul>
            <p>
              Após a exclusão, o acesso ao aplicativo e ao sistema web deixa de
              existir para essa conta.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold">
              Quais dados podem ser mantidos
            </h2>
            <p>
              A política de privacidade prevê retenção quando houver obrigação
              legal. Não adotamos prazos adicionais nesta página.
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                Os dados ficam retidos enquanto a conta estiver ativa e pelo
                prazo necessário às finalidades ou às obrigações legais.
              </li>
              <li>
                O pedido é atendido em até 15 dias,{" "}
                <strong>salvo obrigação legal de retenção</strong>.
              </li>
              <li>
                O tratamento também se fundamenta em obrigação legal quando a
                lei exigir retenção. Nesses casos, os dados necessários a essa
                obrigação podem ser mantidos pelo prazo que a lei determinar.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold">Política completa</h2>
            <p>
              Os termos desta página seguem a seção “9. Exclusão de conta” e as
              demais seções da{" "}
              <Link
                to="/politica-privacidade"
                className="text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Política de Privacidade
              </Link>
              .
            </p>
            <p>
              Dúvidas sobre o pedido ou sobre o app:{" "}
              <Link
                to="/suporte"
                className="text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                página de suporte
              </Link>
              .
            </p>
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
            to="/suporte"
            className="text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Suporte
          </Link>
        </div>
      </footer>
    </div>
  );
}
