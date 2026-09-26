import { redirect } from "next/navigation";

// Folded into the Extensions page - keep the old URL working.
export default function HooksPage() {
    redirect("/extensions?tab=hooks");
}
