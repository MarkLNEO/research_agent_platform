export declare const DEFAULT_MEMORY_MAX_BYTES = 1800;
type KnowledgeRow = {
    title?: string | null;
    content?: string | null;
};
type ImplicitRow = {
    key: string;
    value_json: any;
};
type ObservedSignal = {
    kind?: 'scalar';
    value: number;
    confidence?: number;
} | {
    kind?: 'categorical';
    choice: string;
    confidence?: number;
} | {
    kind?: 'map';
    map: Record<string, number>;
    confidence?: number;
} | Record<string, any>;
export declare function buildMemoryBlockFromData(agent: string, knowledgeRows?: KnowledgeRow[], implicitRows?: ImplicitRow[], maxBytes?: number): string;
export declare function buildMemoryBlock(userId: string, agent?: string): Promise<string>;
export declare function recordPreferenceSignal(userId: string, agent: string, key: string, observed: ObservedSignal, weight?: number): Promise<any>;
export {};
