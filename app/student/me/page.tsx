import { currentSession } from "@/lib/server";
import MyPage from "@/components/MyPage";

export const dynamic = "force-dynamic";

export default async function StudentMePage() {
  const session = await currentSession();
  return <MyPage email={session?.email ?? ""} />;
}
