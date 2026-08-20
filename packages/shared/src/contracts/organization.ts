import { z } from "zod";

export const companyUnitSchema = z.object({
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(20),
  active: z.boolean().default(true),
});
export type CompanyUnitInput = z.infer<typeof companyUnitSchema>;

export const storageLocationSchema = z.object({
  code: z.string().min(1).max(30),
});
export type StorageLocationInput = z.infer<typeof storageLocationSchema>;
