import type { Metadata } from "next";
import { Suspense } from "react";

import { SignupForm } from "@/components/auth/SignupForm";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  // The form reads ?next= from the address, which needs a Suspense boundary.
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
