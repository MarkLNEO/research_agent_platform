import { z } from 'zod';

export const SummarySchemaZ = z.object({
  company_overview: z.string(),
  value_drivers: z.array(z.string()),
  risks: z.array(z.string()),
  eco_profile: z
    .object({
      initiatives: z.array(z.string()),
      certifications: z.array(z.string()).optional(),
    })
    .optional(),
  tech_stack: z.array(z.string()),
  buying_centers: z.array(
    z.object({
      title: z.string(),
      relevance: z.string(),
    })
  ),
  next_actions: z.array(z.string()),
});

export type SummarySchema = z.infer<typeof SummarySchemaZ>;
