import { jwtVerify } from "jose";

// JWT secret from environment
const JWT_SECRET = process.env.WEB_UI_JWT_SECRET || "";
const JWT_SECRET_KEY = JWT_SECRET ? new TextEncoder().encode(JWT_SECRET) : null;

// Helper to validate JWT token and extract payload
export async function validateJwtToken(token: string): Promise<any | null> {
  if (!JWT_SECRET_KEY) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET_KEY);
    return payload;
  } catch (error) {
    return null;
  }
}

// Helper to extract JWT payload from request header
export const getJwtPayload = async (c: any) => {
  if (!JWT_SECRET_KEY) {
    return null;
  }

  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.substring(7);
  return await validateJwtToken(token);
};

// JWT authentication middleware
export const jwtAuth = async (c: any, next: any) => {
  if (!JWT_SECRET_KEY) {
    return c.json({ error: "JWT authentication not configured" }, 500);
  }

  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid authorization header" }, 401);
  }

  const token = authHeader.substring(7);
  try {
    await jwtVerify(token, JWT_SECRET_KEY);
    await next();
  } catch (error) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
};
