import { publicConfig, payoutsAvailable } from "@/lib/paiflow";
import { StarterApp } from "@/components/starter-app";

export const dynamic = "force-dynamic";

export default async function Page() {
  const config = publicConfig();
  // Discovery may be unavailable on older builds. Ordinary payments still work.
  const canChooseRecipient =
    config.mode === "team"
      ? await payoutsAvailable().catch(() => false)
      : false;
  return <StarterApp config={config} payoutsAvailable={canChooseRecipient} />;
}
