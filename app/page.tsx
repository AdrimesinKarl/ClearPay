import { publicConfig } from "@/lib/paiflow";
import { ClearPayApp } from "@/components/clearpay-app";

export const dynamic = "force-dynamic";

export default async function Page() {
  const config = publicConfig();
  return <ClearPayApp config={config} />;
}
