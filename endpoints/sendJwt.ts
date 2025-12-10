import { ScratchEndpointDefinition, UniverseModule, getUniverse } from "../src";

export const sendJwt: ScratchEndpointDefinition = {
  block: async (context) => ({
    opcode: "sendJwt",
    blockType: "command",
    text: "send access token to [email]",
    schema: {
      email: {
        type: "string",
        default: context.userEmail ?? "",
        description: "Email address to send JWT token to",
      },
    },
  }),
  handler: async (context) => {
    const { email } = context.inputs!;

    // Validate email domain
    const orgConfigs = (context.universe!.gsuite as any).orgConfigs;
    if (!orgConfigs || Object.keys(orgConfigs).length === 0) {
      throw new Error("No GSuite organizations configured");
    }

    const allDomains: string[] = [];
    for (const orgConfig of Object.values(orgConfigs) as any[]) {
      for (const domain of orgConfig.domains) {
        if (domain.domainName) {
          allDomains.push(domain.domainName);
        }
      }
    }

    const emailDomain = email.split("@")[1];
    if (!allDomains.includes(emailDomain)) {
      throw new Error(
        `Email domain ${emailDomain} is not in the allowed domains list`
      );
    }

    // Generate JWT token
    const universe = getUniverse();
    if (!universe) {
      throw new Error("Universe not initialized");
    }
    const jwt = await universe.auth.signJwtToken({ email });

    // Send email via Resend
    const response = await context.universe!.resend!.sendEmail({
      from: "jwt-issuer@divizend.ai",
      to: email,
      subject: "Admin Access Token",
      html: `<p>Your admin access token is:</p><pre><code>${jwt}</code></pre><p>Use this token to authenticate in the admin interface.</p>`,
    });

    if (!response.ok) {
      throw new Error(`Failed to send email: ${response.text}`);
    }

    return { success: true, message: "JWT token sent successfully" };
  },
  noAuth: true,
  requiredModules: [UniverseModule.GSuite, UniverseModule.Resend],
};
