import type { Metadata } from "next";
import { Workbench } from "@/workbench/workbench";

export const metadata: Metadata = {
  title: "Workbench",
  description: "Ostra Ops: an integrated demo where Detent components drive each other, from the command palette to Scout's approvals.",
};

export default function Page() {
  return <Workbench />;
}
