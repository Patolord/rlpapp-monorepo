import { CircleUserRound, Loader2, LogIn, LogOut, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { WEB_URL } from "../lib/account/config";
import { canSignIn } from "../lib/account/session";
import { useStore } from "../store";

/**
 * Top bar: sign in to the company account ("Entrar"), or who is signed in and "Sair". Signing in
 * opens the browser at the dashboard; the user confirms there and comes back connected.
 */
export function AccountMenu() {
  const account = useStore((s) => s.account);
  const { signIn, cancelSignIn, signOut } = useStore.getState();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  if (account.status === "unknown") return null;

  if (account.status === "signingIn") {
    return (
      <div className="flex shrink-0 items-center gap-1.5 text-xs text-neutral-300">
        <Loader2 size={15} className="animate-spin text-orange-400" />
        <span title="Confirme no navegador que abriu; depois volte para cá">
          Confirme no navegador…
        </span>
        <button
          type="button"
          onClick={() => void cancelSignIn()}
          title="Cancelar o login"
          className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100"
        >
          <X size={15} />
        </button>
      </div>
    );
  }

  if (account.status === "signedOut") {
    const enabled = canSignIn();
    return (
      <div className="flex shrink-0 items-center gap-1.5">
        {account.error && (
          <span className="max-w-[16rem] truncate text-[11px] text-red-400" title={account.error}>
            {account.error}
          </span>
        )}
        <button
          type="button"
          disabled={!enabled}
          onClick={() => void signIn()}
          title={
            enabled
              ? `Entrar com a conta da empresa (${new URL(WEB_URL).host}): catálogo e propostas em seu nome`
              : "O login com a conta da empresa só funciona no app instalado"
          }
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-neutral-800 px-2.5 text-xs font-medium text-neutral-200 ring-1 ring-neutral-700 hover:bg-neutral-700 disabled:opacity-40"
        >
          <LogIn size={15} /> Entrar
        </button>
      </div>
    );
  }

  const name = account.user?.name ?? "Conta da empresa";
  const first = name.split(/\s+/)[0] || name;
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title={account.offline ? "Conta da empresa (sem conexão agora)" : `Conectado como ${name}`}
        className="inline-flex h-8 max-w-[11rem] items-center gap-1.5 rounded-md px-2 text-xs font-medium text-neutral-200 hover:bg-neutral-800"
      >
        <CircleUserRound
          size={17}
          className={account.offline ? "text-neutral-500" : "text-orange-400"}
        />
        <span className="truncate">{first}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-40 w-72 rounded-md border border-neutral-700 bg-neutral-900 py-1 text-xs shadow-xl">
          <div className="border-b border-neutral-800 px-3 py-2">
            <div className="truncate font-medium text-neutral-100">{name}</div>
            {account.user?.email && (
              <div className="truncate text-neutral-500">{account.user.email}</div>
            )}
            <p className="mt-1 text-[11px] text-neutral-500">
              {account.offline
                ? "Sem conexão com a empresa agora: o catálogo salvo continua valendo e as propostas esperam na fila."
                : "Catálogo da empresa e propostas de material usam a sua conta. Desconecte este computador também em Minha conta › Agentes, no app web."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-neutral-200 hover:bg-neutral-800"
          >
            <LogOut size={15} /> Sair
          </button>
        </div>
      )}
    </div>
  );
}
