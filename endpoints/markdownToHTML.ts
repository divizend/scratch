import { ScratchEndpointDefinition } from "../src";
import { marked } from "marked";

export const markdownToHTML: ScratchEndpointDefinition = {
  block: async (context) => ({
    opcode: "markdownToHTML",
    blockType: "reporter",
    text: "Markdown to HTML from [markdown]",
    schema: {
      markdown: {
        type: "string",
        default: JSON.stringify(
          "# Hello World\n\nThis is a **markdown** example with a [link](https://example.com)."
        ),
        description: "JSON-stringified Markdown text to convert to HTML",
      },
    },
  }),
  handler: async (context) => {
    const { markdown } = context.validatedBody!;
    // Parse JSON-stringified markdown first
    let markdownText: string;
    try {
      markdownText = JSON.parse(markdown);
    } catch (error) {
      // If parsing fails, assume it's already plain markdown (backward compatibility)
      markdownText = markdown;
    }
    const html = await marked(markdownText);
    return html;
  },
};
