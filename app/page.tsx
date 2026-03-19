import { getDashboardOverview } from "@/lib/dashboard-data";
import { GameShell } from "@/app/components/game-shell";

export const dynamic = "force-dynamic";

export default async function Home() {
  const overview = await getDashboardOverview();

  return <GameShell overview={overview} />;
}
