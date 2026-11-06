import { Link } from "@tanstack/react-router";
import { MailX } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const INVITE_HOME = "/app";

export function InviteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f8fc] px-4 py-8">
      {children}
    </div>
  );
}

export function InvalidInvite({ title, description }: { title: string; description: string }) {
  return (
    <Card className="w-full max-w-md shadow-sm">
      <CardHeader className="items-center text-center">
        <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <MailX className="size-6" />
        </div>
        <CardTitle className="text-xl font-semibold">{title}</CardTitle>
        <CardDescription className="text-base">{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        <Button render={<Link to="/" />} variant="outline">
          Ir para o login
        </Button>
      </CardContent>
    </Card>
  );
}
