class DivizendJulianNalenz {
  constructor() {}

  getInfo() {
    return {
      id: "DivizendJulianNalenz",
      name: "Divizend (Julian Nalenz)",
      blocks: [
        {
          opcode: "sendEmail",
          blockType: "command",
          text: "send email [from] [to] [content] [resendApiKey]",
          arguments: {
            from: {
              type: "string",
              defaultValue: "scratch-demo@divizend.ai",
            },
            to: {
              type: "string",
              defaultValue: "julian.nalenz@divizend.com",
            },
            content: {
              type: "string",
              defaultValue: "Hello from a Scratch block!",
            },
            resendApiKey: {
              type: "string",
              defaultValue: "Resend API key",
            },
          },
        },
      ],
    };
  }

  sendEmail({ from, to, content, resendApiKey }) {
    return fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `Scratch BPA <${from}>`,
        to: [to],
        subject: "Email sent via Scratch",
        html: `<p>${content}</p>`,
      }),
    }).then((response) => response.text());
  }
}

Scratch.extensions.register(new Divizend());
