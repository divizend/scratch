import { ScratchEndpointDefinition } from "../scratch";
import { signJwtToken } from "../auth";
import { UniverseModule } from "../../core";

// Core and authentication endpoints
export const coreEndpoints: ScratchEndpointDefinition[] = [
  // Get available domains (public, for JWT sending)
  {
    block: async (context) => ({
      opcode: "getDomains",
      blockType: "reporter",
      text: "available email domains",
      arguments: {},
    }),
    handler: async (context) => {
      try {
        const orgConfigs = (context.universe!.gsuite as any).orgConfigs;
        if (!orgConfigs || Object.keys(orgConfigs).length === 0) {
          return [];
        }

        const allDomains: string[] = [];
        for (const orgConfig of Object.values(orgConfigs) as any[]) {
          for (const domain of orgConfig.domains) {
            if (domain.domainName) {
              allDomains.push(domain.domainName);
            }
          }
        }

        return allDomains;
      } catch (error) {
        return [];
      }
    },
    noAuth: true,
    requiredModules: [UniverseModule.GSuite],
  },

  // Send JWT token via email
  {
    block: async (context) => ({
      opcode: "sendJwt",
      blockType: "command",
      text: "send access token to [email]",
      arguments: {
        email: {
          type: "string",
          defaultValue: context.userEmail ?? "",
        },
      },
    }),
    handler: async (context) => {
      const { email } = context.validatedBody || {};

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
      const jwt = await signJwtToken({ email });

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
  },

  // Get current user email
  {
    block: async (context) => ({
      opcode: "getUser",
      blockType: "reporter",
      text: "current user email",
      arguments: {},
    }),
    handler: async (context) => {
      return { email: context.userEmail || "Unknown" };
    },
  },

  // Health check for googleapis connection
  {
    block: async (context) => ({
      opcode: "getHealth",
      blockType: "reporter",
      text: "Google Workspace connection status",
      arguments: {},
    }),
    handler: async (context) => {
      try {
        const orgConfigs = (context.universe!.gsuite as any).orgConfigs;
        if (!orgConfigs || Object.keys(orgConfigs).length === 0) {
          return {
            status: "error",
            message: "No GSuite organizations configured",
            connected: false,
          };
        }

        const firstOrg = Object.keys(orgConfigs)[0];
        const orgConfig = orgConfigs[firstOrg];
        const gsuiteUser = context.universe!.gsuite.user(orgConfig.adminUser);
        const admin = gsuiteUser.admin();

        await admin.getDomains();

        return {
          status: "ok",
          message: "Google APIs connection active",
          connected: true,
          organization: firstOrg,
        };
      } catch (error) {
        return {
          status: "error",
          message: error instanceof Error ? error.message : "Unknown error",
          connected: false,
        };
      }
    },
    requiredModules: [UniverseModule.GSuite],
  },
];
