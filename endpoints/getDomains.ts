import { ScratchEndpointDefinition, UniverseModule } from "../src";

export const getDomains: ScratchEndpointDefinition = {
  block: async (context) => ({
    opcode: "getDomains",
    blockType: "reporter",
    text: "available email domains",
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
};
