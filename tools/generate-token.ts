#!/usr/bin/env bun

import { SignJWT } from "jose";

const secret = process.env.WEB_UI_JWT_SECRET;
if (!secret) {
  console.error("Error: WEB_UI_JWT_SECRET environment variable is not set");
  process.exit(1);
}

const secretKey = new TextEncoder().encode(secret);

async function generateToken() {
  const jwt = await new SignJWT({
    email: "julian.nalenz@divizend.com",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1y") // Token valid for 1 year
    .sign(secretKey);

  console.log(jwt);
}

generateToken().catch(console.error);
