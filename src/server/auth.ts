import { betterAuth, APIError } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db, readState, transact, pool } from "./db";
import * as schema from "./schema";
import { activateAccount, signupAllowed, normalizedEmail } from "./domain";
import { sendEmail } from "./notifications";
export const appUrl = process.env.APP_URL ?? "http://localhost:5173";
export function makeAuth() {
  if (
    !process.env.BETTER_AUTH_SECRET ||
    process.env.BETTER_AUTH_SECRET.length < 32
  )
    throw new Error("Set BETTER_AUTH_SECRET to at least 32 random characters.");
  return betterAuth({
    logger: { disabled: true },
    appName: "Little Hint",
    baseURL: appUrl,
    basePath: "/api/auth",
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: [appUrl],
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: { enabled: false },
    user: { changeEmail: { enabled: false } },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    advanced: { useSecureCookies: appUrl.startsWith("https:") },
    rateLimit: { enabled: true, window: 60, max: 30 },
    databaseHooks: {
      user: {
        create: {
          before: async (u) => {
            if (!signupAllowed(await readState(), u.email))
              throw new APIError("FORBIDDEN", {
                message: "An active invitation is required.",
              });
            return { data: { ...u, email: normalizedEmail(u.email) } };
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const r = await pool.query(
              'SELECT id,email,name,email_verified FROM "user" WHERE id=$1',
              [session.userId],
            );
            const u = r.rows[0];
            if (!u?.email_verified)
              throw new APIError("FORBIDDEN", {
                message: "Verify your email first.",
              });
            await transact((s) =>
              activateAccount(s, { id: u.id, email: u.email, name: u.name }),
            );
            return { data: session };
          },
        },
      },
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 5,
        storeOTP: "hashed",
        sendVerificationOTP: async ({ email, otp, type }) => {
          const known = await pool.query(
            'SELECT id FROM "user" WHERE email=$1',
            [normalizedEmail(email)],
          );
          if (!known.rowCount && !signupAllowed(await readState(), email))
            return;
          if (type !== "sign-in") return;
          await sendEmail(
            email,
            "Your Little Hint sign-in code",
            `Your Little Hint sign-in code is ${otp}. It expires in 10 minutes. If you did not request it, ignore this email.`,
          );
        },
      }),
      passkey({
        rpID: new URL(appUrl).hostname,
        rpName: "Little Hint",
        origin: appUrl,
      }),
    ],
  });
}
