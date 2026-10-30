import { APIError } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";
import { startSms, verifySms } from "./sms";
// A deliberately small Better Auth plugin: no phone signup, password reset,
// profile update, or implicit account creation endpoints are registered.
export function smsAuth() {
  return {
    id: "little-hint-sms",
    endpoints: {
      smsSendCode: createAuthEndpoint(
        "/sms/send-code",
        { method: "POST", body: z.object({ phone: z.string().max(40) }) },
        async (ctx) => {
          const challenge = await startSms(undefined, ctx.body.phone, "login");
          return ctx.json({
            challenge,
            message:
              "If this number has SMS sign-in enabled, a code is on its way. You can also use email or a passkey.",
          });
        },
      ),
      smsSignIn: createAuthEndpoint(
        "/sms/sign-in",
        {
          method: "POST",
          body: z.object({
            challenge: z.string().uuid(),
            code: z.string().regex(/^\d{6}$/),
          }),
        },
        async (ctx) => {
          let id: string;
          try {
            id = await verifySms(ctx.body.challenge, ctx.body.code, "login");
          } catch {
            throw new APIError("BAD_REQUEST", {
              message:
                "The code was not accepted or has expired. Use email or a passkey, or request a new code.",
            });
          }
          const user = await ctx.context.internalAdapter.findUserById(id);
          if (!user?.emailVerified)
            throw new APIError("BAD_REQUEST", {
              message: "Use email or a passkey to sign in.",
            });
          const session = await ctx.context.internalAdapter.createSession(
            user.id,
          );
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ ok: true });
        },
      ),
    },
    rateLimit: [
      {
        pathMatcher: (path: string) => path === "/sms/send-code",
        window: 60,
        max: 3,
      },
      {
        pathMatcher: (path: string) => path === "/sms/sign-in",
        window: 60,
        max: 5,
      },
    ],
  };
}
