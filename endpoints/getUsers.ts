import { ScratchEndpointDefinition, UniverseModule } from "@divizend/scratch-core";

export const getUsers: ScratchEndpointDefinition = {
  block: async (context) => ({
    opcode: "getUsers",
    blockType: "reporter",
    text: "organization users",
  }),
  handler: async (context) => {
    if (!context.userEmail) {
      return [];
    }

    try {
      const gsuiteUser = context.universe!.gsuite.user(context.userEmail);
      const admin = gsuiteUser.admin();
      const users = await admin.getUsers();
      return users.map((user) => ({
        email: user.primaryEmail,
        name: user.name?.fullName,
      }));
    } catch (error) {
      return [];
    }
  },
  requiredModules: [UniverseModule.GSuite],
};
