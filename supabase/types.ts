export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type GenericRelationship = {
  foreignKeyName: string;
  columns: string[];
  referencedRelation: string;
  referencedColumns: string[];
};

type GenericTable = {
  Row: Record<string, Json | undefined>;
  Insert: Record<string, Json | undefined>;
  Update: Record<string, Json | undefined>;
  Relationships: GenericRelationship[];
};

type PublicTables = {
  user_preferences: {
    Row: {
      id: string;
      user_id: string;
      key: string;
      value: Json;
      source: string;
      confidence: number | null;
      created_at: string | null;
      updated_at: string | null;
    };
    Insert: {
      id?: string;
      user_id: string;
      key: string;
      value: Json;
      source: string;
      confidence?: number | null;
      created_at?: string | null;
      updated_at?: string | null;
    };
    Update: {
      id?: string;
      user_id?: string;
      key?: string;
      value?: Json;
      source?: string;
      confidence?: number | null;
      created_at?: string | null;
      updated_at?: string | null;
    };
    Relationships: [
      {
        foreignKeyName: 'user_preferences_user_id_fkey';
        columns: ['user_id'];
        referencedRelation: 'users';
        referencedColumns: ['id'];
      }
    ];
  };
  entity_aliases: {
    Row: {
      id: string;
      canonical: string;
      aliases: string[];
      type: string;
      metadata: Json | null;
      source: string | null;
      created_at: string | null;
      updated_at: string | null;
    };
    Insert: {
      id?: string;
      canonical: string;
      aliases: string[];
      type: string;
      metadata?: Json | null;
      source?: string | null;
      created_at?: string | null;
      updated_at?: string | null;
    };
    Update: {
      id?: string;
      canonical?: string;
      aliases?: string[];
      type?: string;
      metadata?: Json | null;
      source?: string | null;
      created_at?: string | null;
      updated_at?: string | null;
    };
    Relationships: [];
  };
  user_entity_aliases: {
    Row: {
      id: string;
      user_id: string;
      alias: string;
      alias_normalized: string;
      canonical: string;
      type: string;
      metadata: Json | null;
      source: string | null;
      created_at: string | null;
      updated_at: string | null;
    };
    Insert: {
      id?: string;
      user_id: string;
      alias: string;
      alias_normalized?: string;
      canonical: string;
      type?: string;
      metadata?: Json | null;
      source?: string | null;
      created_at?: string | null;
      updated_at?: string | null;
    };
    Update: {
      id?: string;
      user_id?: string;
      alias?: string;
      alias_normalized?: string;
      canonical?: string;
      type?: string;
      metadata?: Json | null;
      source?: string | null;
      created_at?: string | null;
      updated_at?: string | null;
    };
    Relationships: [
      {
        foreignKeyName: 'user_entity_aliases_user_id_fkey';
        columns: ['user_id'];
        referencedRelation: 'users';
        referencedColumns: ['id'];
      }
    ];
  };
  open_questions: {
    Row: {
      id: string;
      user_id: string;
      question: string;
      context: Json | null;
      asked_at: string | null;
      resolved_at: string | null;
      resolution: string | null;
      created_at: string | null;
      updated_at: string | null;
    };
    Insert: {
      id?: string;
      user_id: string;
      question: string;
      context?: Json | null;
      asked_at?: string | null;
      resolved_at?: string | null;
      resolution?: string | null;
      created_at?: string | null;
      updated_at?: string | null;
    };
    Update: {
      id?: string;
      user_id?: string;
      question?: string;
      context?: Json | null;
      asked_at?: string | null;
      resolved_at?: string | null;
      resolution?: string | null;
      created_at?: string | null;
      updated_at?: string | null;
    };
    Relationships: [
      {
        foreignKeyName: 'open_questions_user_id_fkey';
        columns: ['user_id'];
        referencedRelation: 'users';
        referencedColumns: ['id'];
      }
    ];
  };
} & {
  [key: string]: GenericTable;
};

export interface Database {
  public: {
    Tables: PublicTables;
    Views: {
      [key: string]: {
        Row: Record<string, Json | undefined>;
        Relationships: GenericRelationship[];
      };
    };
    Functions: {
      [key: string]: {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
    };
    Enums: Record<string, string[]>;
    CompositeTypes: Record<string, Record<string, Json | undefined>>;
  };
}
