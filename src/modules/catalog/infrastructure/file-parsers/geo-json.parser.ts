import { Injectable } from '@nestjs/common';
import { IFileParser, ParseResult } from './parser.interface';

interface GeoJsonFeature {
  type: string;
  geometry?: { type: string; coordinates: unknown };
  properties?: Record<string, unknown>;
}

interface GeoJsonCollection {
  type: string;
  features?: GeoJsonFeature[];
}

/** Type guard: is this a FeatureCollection? */
function isFeatureCollection(
  obj: GeoJsonCollection | GeoJsonFeature,
): obj is GeoJsonCollection {
  return (
    obj.type === 'FeatureCollection' &&
    Array.isArray((obj as GeoJsonCollection).features)
  );
}

/** Type guard: is this a Feature? */
function isFeature(
  obj: GeoJsonCollection | GeoJsonFeature,
): obj is GeoJsonFeature {
  return (
    obj.type === 'Feature' &&
    !Array.isArray((obj as GeoJsonCollection).features)
  );
}

@Injectable()
export class GeoJsonParser implements IFileParser {
  supports(fileName: string): boolean {
    const lower = fileName.toLowerCase();
    return lower.endsWith('.geojson') || lower.endsWith('.json');
  }

  parse(buffer: Buffer, fileName: string): ParseResult {
    const errors: Array<{ row: number; message: string }> = [];
    const features: ParseResult['features'] = [];
    const geometryTypes = new Set<string>();

    try {
      const content = buffer.toString('utf-8');
      const parsed = JSON.parse(content) as GeoJsonCollection | GeoJsonFeature;

      if (isFeatureCollection(parsed)) {
        // Process FeatureCollection
        for (let i = 0; i < (parsed.features ?? []).length; i++) {
          const feature = parsed.features![i];
          if (!feature || feature.type !== 'Feature') {
            errors.push({
              row: i + 1,
              message: `Row ${i + 1}: Not a valid Feature object`,
            });
            continue;
          }
          if (!feature.geometry || !feature.geometry.type) {
            errors.push({
              row: i + 1,
              message: `Row ${i + 1}: Missing geometry`,
            });
            continue;
          }

          features.push({
            geometry: feature.geometry,
            properties: feature.properties ?? {},
            name: (feature.properties?.name as string) ?? `Imported ${i + 1}`,
          });
          geometryTypes.add(feature.geometry.type);
        }
      } else if (isFeature(parsed)) {
        // Process single Feature
        if (!parsed.geometry || !parsed.geometry.type) {
          errors.push({ row: 0, message: 'Feature is missing geometry' });
        } else {
          features.push({
            geometry: parsed.geometry,
            properties: parsed.properties ?? {},
            name:
              (parsed.properties?.name as string) ??
              fileName.replace(/\.(geojson|json)$/i, ''),
          });
          geometryTypes.add(parsed.geometry.type);
        }
      } else {
        errors.push({
          row: 0,
          message: 'Root element must be a FeatureCollection or Feature',
        });
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unknown parse error';
      errors.push({ row: 0, message: `Invalid GeoJSON: ${message}` });
    }

    return {
      features,
      errors,
      metadata: {
        featureCount: features.length,
        geometryTypes: Array.from(geometryTypes),
      },
    };
  }
}
