import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export function ConvexUnauthRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: "/" });
  }, [navigate]);
  return null;
}
