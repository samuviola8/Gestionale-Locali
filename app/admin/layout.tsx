import { redirect } from "next/navigation";
import { getTenantFromHost } from "@/lib/tenant-host";

// L'area super-admin vive solo sul dominio principale, non sui sottodomini dei locali.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tenant = await getTenantFromHost();
  if (tenant) redirect("/");
  return <>{children}</>;
}
