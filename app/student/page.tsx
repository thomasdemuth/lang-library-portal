import { currentSession } from "@/lib/server";
import StudentHome from "@/components/StudentHome";

export const dynamic = "force-dynamic";

export default async function StudentHomePage() {
  const session = await currentSession();
  return <StudentHome email={session?.email ?? ""} />;
}
