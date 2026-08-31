import CirculationDesk from "@/components/CirculationDesk";

export const metadata = { title: "Checkout Desk — Lang Library" };

/**
 * The teacher circulation desk: scan or type a book, pick the student,
 * check out / check in, and see who has what. Management gets the same
 * desk at the top of Management → Circulation.
 */
export default function StaffDeskPage() {
  return (
    <div className="wrap" style={{ maxWidth: 640 }}>
      <h1>Checkout Desk</h1>
      <p className="sub">
        Scan the barcode on the back (or type the title), pick the student, one tap. Works for
        checking books out and back in.
      </p>
      <CirculationDesk />
    </div>
  );
}
