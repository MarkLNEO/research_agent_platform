import { z } from 'zod';
export declare const SummarySchemaZ: z.ZodObject<{
    company_overview: z.ZodString;
    value_drivers: z.ZodArray<z.ZodString, "many">;
    risks: z.ZodArray<z.ZodString, "many">;
    eco_profile: z.ZodOptional<z.ZodObject<{
        initiatives: z.ZodArray<z.ZodString, "many">;
        certifications: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        initiatives?: string[];
        certifications?: string[];
    }, {
        initiatives?: string[];
        certifications?: string[];
    }>>;
    tech_stack: z.ZodArray<z.ZodString, "many">;
    buying_centers: z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        relevance: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        title?: string;
        relevance?: string;
    }, {
        title?: string;
        relevance?: string;
    }>, "many">;
    next_actions: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    company_overview?: string;
    value_drivers?: string[];
    risks?: string[];
    eco_profile?: {
        initiatives?: string[];
        certifications?: string[];
    };
    tech_stack?: string[];
    buying_centers?: {
        title?: string;
        relevance?: string;
    }[];
    next_actions?: string[];
}, {
    company_overview?: string;
    value_drivers?: string[];
    risks?: string[];
    eco_profile?: {
        initiatives?: string[];
        certifications?: string[];
    };
    tech_stack?: string[];
    buying_centers?: {
        title?: string;
        relevance?: string;
    }[];
    next_actions?: string[];
}>;
export type SummarySchema = z.infer<typeof SummarySchemaZ>;
