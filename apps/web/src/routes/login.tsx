import { RedirectToSignIn } from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  return <RedirectToSignIn redirectUrl="/estoque" />;
}
