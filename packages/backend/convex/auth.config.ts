export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN ?? "https://mature-jaguar-60.clerk.accounts.dev",
      applicationID: "convex",
    },
  ],
};
