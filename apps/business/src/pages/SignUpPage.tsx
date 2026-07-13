/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { SignUp } from "@clerk/clerk-react";
import { AuthLayout } from "../components/AuthLayout";

export function SignUpPage() {
  return (
    <AuthLayout
      title="Create your workspace"
      subtitle="Set up Sweepr Business for your properties and team."
    >
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" fallbackRedirectUrl="/dashboard" />
    </AuthLayout>
  );
}
