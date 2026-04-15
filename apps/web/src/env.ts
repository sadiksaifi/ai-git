import { z } from "zod";

export const alchemyEnvSchema = z.object({
  DOMAIN: z.string().optional(),
  ALCHEMY_PASSWORD: z.string(),
});

export type AlchemyEnv = z.infer<typeof alchemyEnvSchema>;

export function createEnvValidator<T extends z.ZodType>(schema: T) {
  return (env: Record<string, string | undefined>): z.infer<T> => schema.parse(env) as z.infer<T>;
}
