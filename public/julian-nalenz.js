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
          text: "send email [from] [to] [subject] [content] [resendApiKey]",
          arguments: {
            from: {
              type: "string",
              defaultValue: "scratch-demo@divizend.ai",
            },
            to: {
              type: "string",
              defaultValue: "julian.nalenz@divizend.com",
            },
            subject: {
              type: "string",
              defaultValue: "Hello from a Scratch block!",
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

  sendEmail({ from, to, subject, content, resendApiKey }) {
    return fetch("https://scratch.divizend.ai/api/send-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        content,
        resendApiKey,
      }),
    }).then((response) => response.text());
  }
}

Scratch.extensions.register(new DivizendJulianNalenz());
