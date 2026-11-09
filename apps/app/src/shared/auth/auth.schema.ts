import { z } from "zod";

export const passwordSchema = z.string().min(1);

export const strongPasswordSchema = z.string().min(15).max(128);

export const nameSchema = z.string().min(2).max(80);

// One custom check rather than min/max/regex: the built-in checks emit the
// generic length copy from the global map, and a 5-digit entry reading "Must be
// at least 6 characters" is exactly the field-specific message extraction was
// not supposed to lose.
export const signInSchema = z.object({
  email: z.email(),
  password: passwordSchema,
  rememberMe: z.boolean(),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const signUpSchema = z.object({
  name: nameSchema,
  email: z.email(),
  password: strongPasswordSchema,
  acceptedPolicies: z
    .boolean()
    .refine((v) => v, { params: { i18nKey: "validation.acceptPolicies" } }),
});
export type SignUpInput = z.infer<typeof signUpSchema>;
