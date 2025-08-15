import { SessionProvider } from "next-auth/react";
import { auth } from "@/lib/auth";
import { IdentifyComponent } from "@openpanel/nextjs";

export default async function AuthLayout({
  children, // will be a page or nested layout
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  return (
    <SessionProvider session={session}>
      {children}
      {session?.user?.id && (
        <IdentifyComponent profileId={`usr_${session?.user?.id}`} />
      )}
    </SessionProvider>
  );
}
