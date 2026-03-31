import { useClerk } from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const clerk = useClerk();

  useEffect(() => {
    clerk.redirectToSignIn({ redirectUrl: "/app" });
  }, [clerk]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <p className="text-gray-500">Redirecionando para login...</p>
    </div>
  );
}
