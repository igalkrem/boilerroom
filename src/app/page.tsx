import { redirect } from "next/navigation";
import { getSession, isSessionValid } from "@/lib/session";

export default async function Home() {
  const session = await getSession();
  if (isSessionValid(session)) {
    redirect("/dashboard");
  }
  redirect("/login");
}
