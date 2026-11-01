import {
  type AccountUser,
  cancelSignIn,
  dropRevokedSession,
  onAccountUser,
  restoreSession,
  SignedOutError,
  signInWithBrowser,
  signOut,
} from "../lib/account/session";
import { errorMessage, type Slice } from "./shared";

/**
 * The company account this computer is signed in with (lib/account). Signed in, the catalog
 * and the material proposals go through the typed Convex client as the user; signed out, the
 * shared catalog token (if any) keeps working as before.
 */
export interface AccountState {
  status: "unknown" | "signedOut" | "signingIn" | "signedIn";
  user: AccountUser | null;
  /** Signed in, but the server could not be reached to confirm it (calls retry later). */
  offline: boolean;
  /** Last sign-in failure, shown in the account menu. */
  error: string | null;
}

export interface AccountSlice {
  account: AccountState;
  /** Pick up the device token stored by an earlier session (at launch). */
  restoreAccount(): Promise<void>;
  /** Browser sign-in; resolves when connected or failed (the error lands in `account.error`). */
  signIn(): Promise<void>;
  cancelSignIn(): Promise<void>;
  signOut(): Promise<void>;
  /** The server refused the device token while in use (revoked): back to signed out. */
  handleSignedOut(e: unknown): Promise<boolean>;
}

const signedOut: AccountState = { status: "signedOut", user: null, offline: false, error: null };

export const createAccountSlice: Slice<AccountSlice> = (set, get) => {
  onAccountUser((user) =>
    set((s) =>
      s.account.status === "signedIn" ? { account: { ...s.account, user, offline: false } } : {},
    ),
  );
  return {
    account: { status: "unknown", user: null, offline: false, error: null },

    restoreAccount: async () => {
      try {
        const restored = await restoreSession();
        if (restored === null) set({ account: signedOut });
        else if (restored === "offline")
          set({ account: { status: "signedIn", user: null, offline: true, error: null } });
        else set({ account: { status: "signedIn", user: restored, offline: false, error: null } });
      } catch (e) {
        set({ account: { ...signedOut, error: errorMessage(e) } });
      }
    },

    signIn: async () => {
      if (get().account.status === "signingIn") return;
      set({ account: { ...signedOut, status: "signingIn" } });
      try {
        const user = await signInWithBrowser();
        set({
          account: { status: "signedIn", user, offline: false, error: null },
          status: `Conectado como ${user.name}: catálogo e propostas usam a sua conta`,
        });
        // the catalog follows the account right away; queued proposals go out as the user
        await get()
          .refreshCatalog()
          .catch((e) => set({ status: `Falha ao atualizar o catálogo: ${errorMessage(e)}` }));
      } catch (e) {
        const message = errorMessage(e);
        set({
          account: { ...signedOut, error: message === "cancelado" ? null : message },
        });
      }
    },

    cancelSignIn: async () => {
      await cancelSignIn().catch(() => undefined);
    },

    signOut: async () => {
      await signOut().catch(() => undefined);
      set({ account: signedOut, status: "Conta da empresa desconectada deste computador" });
    },

    handleSignedOut: async (e) => {
      if (!(e instanceof SignedOutError)) return false;
      await dropRevokedSession().catch(() => undefined);
      set({
        account: { ...signedOut, error: e.message },
        status:
          "Este computador foi desconectado da conta da empresa: entre de novo (Entrar, no topo)",
      });
      return true;
    },
  };
};
