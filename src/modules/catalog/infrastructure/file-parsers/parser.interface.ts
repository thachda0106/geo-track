export interface ParseResult {
  features: Array<{
    geometry: { type: string; coordinates: unknown };
    properties: Record<string, unknown>;
    name: string;
  }>;
  errors: Array<{ row: number; message: string }>;
  metadata: {
    featureCount: number;
    geometryTypes: string[];
  };
}

export interface IFileParser {
  supports(fileName: string): boolean;
  parse(buffer: Buffer, fileName: string): ParseResult;
}
