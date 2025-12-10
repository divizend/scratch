import { ScratchEndpointDefinition, UniverseModule } from "../src";

export const queueEmail: ScratchEndpointDefinition = {
  block: async (context) => ({
    opcode: "queueEmail",
    blockType: "command",
    text: "add email to queue from [from] to [to] subject [subject] content [content]",
    schema: {
      from: {
        type: "string",
        default: "scratch-demo@divizend.ai",
        description: "Sender email address",
      },
      to: {
        type: "string",
        default: context.userEmail ?? "julian.nalenz@divizend.com",
        description: "Recipient email address",
      },
      subject: {
        type: "string",
        default: "Hello from a Scratch block!",
        description: "Email subject",
      },
      content: {
        type: "string",
        default: "This email was sent from a Scratch block!",
        description: "Email content",
      },
    },
  }),
  handler: async (context) => {
    const { from, to, subject, content } = context.validatedBody!;

    // Extract domain from "from" email address
    const fromDomain = from.split("@")[1];
    if (!fromDomain) {
      throw new Error(`Invalid email address: ${from}`);
    }

    // Validate domain using the email queue
    const isValidDomain = await context.universe!.emailQueue.validateDomain(
      fromDomain
    );
    if (!isValidDomain) {
      throw new Error(
        `Unrecognized sender domain: ${fromDomain}. Domain must be handled by one of the configured email profiles.`
      );
    }

    // Queue the email - routing will happen when sending
    const queuedEmail = context.universe!.emailQueue.add({
      from,
      to,
      subject,
      content,
    });

    return {
      success: true,
      id: queuedEmail.id,
      message: "Email queued",
    };
  },
  requiredModules: [UniverseModule.EmailQueue],
};
