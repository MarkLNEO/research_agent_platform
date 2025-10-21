type TableName = 'user_preferences' | 'entity_aliases' | 'user_entity_aliases' | 'open_questions';
export declare function ensureTable(table: TableName): Promise<void>;
export {};
