import StudentProfile from "@/components/StudentProfile";

export const dynamic = "force-dynamic";

export default async function StudentPublicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StudentProfile id={id} />;
}
