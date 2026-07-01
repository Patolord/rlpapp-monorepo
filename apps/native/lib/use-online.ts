import NetInfo from "@react-native-community/netinfo";
import { useEffect, useState } from "react";

/**
 * Estado de conectividade do aparelho. Considera "online" quando há conexão
 * e a internet está acessível (quando o SO consegue confirmar).
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const reachable = state.isInternetReachable;
      setOnline(Boolean(state.isConnected) && reachable !== false);
    });

    NetInfo.fetch()
      .then((state) => {
        const reachable = state.isInternetReachable;
        setOnline(Boolean(state.isConnected) && reachable !== false);
      })
      .catch(() => {
        // Em caso de falha de leitura, assume online para não bloquear o uso.
        setOnline(true);
      });

    return () => unsubscribe();
  }, []);

  return online;
}
