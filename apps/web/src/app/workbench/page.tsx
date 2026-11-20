import { canonicalMetadata } from "@/site";
import type { Metadata } from "next";
import { Workbench } from "@/workbench/workbench";

export const metadata: Metadata = { ...canonicalMetadata("workbench"),
  title: "Workbench",
  description: "Ostra Ops: an integrated demo where Detent components drive each other, from the command palette to Scout's approvals.",
};

export default function Page() {
  return <Workbench />;
}
