export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: Record<
      string,
      {
        Row: Record<string, Json | undefined>;
        Insert: Record<string, Json | undefined>;
        Update: Record<string, Json | undefined>;
        Relationships: Array<{
          foreignKeyName: string;
          columns: string[];
          referencedRelation: string;
          referencedColumns: string[];
        }>;
      }
    >;
    Views: Record<
      string,
      {
        Row: Record<string, Json | undefined>;
        Relationships: Array<{
          foreignKeyName: string;
          columns: string[];
          referencedRelation: string;
          referencedColumns: string[];
        }>;
      }
    >;
    Functions: Record<
      string,
      {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      }
    >;
    Enums: Record<string, string[]>;
    CompositeTypes: Record<string, Record<string, Json | undefined>>;
  };
}
