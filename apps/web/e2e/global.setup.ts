import { clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";

// Obtains a Clerk Testing Token once and shares it with all tests,
// allowing them to bypass Clerk's bot detection.
setup.describe.configure({ mode: "serial" });

setup("global setup", async () => {
  await clerkSetup();
});
