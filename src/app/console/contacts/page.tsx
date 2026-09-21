import { redirect } from "next/navigation";

export const metadata = { title: "Contacts" };

export default function Contacts() {
  redirect("/console/contacts/lists");
}
