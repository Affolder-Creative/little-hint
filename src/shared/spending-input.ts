import { z } from "zod";
const id = z.string().uuid();
export const allocationsInput = z
  .array(
    z.object({
      recipientId: id,
      share: z.number().finite().min(0).max(1000000),
      listId: id.nullable().optional(),
    }),
  )
  .min(1)
  .max(20);
