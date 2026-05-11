import { Injectable } from '@nestjs/common';
import { IFileParser, ParseResult } from './parser.interface';

/**
 * Minimal CSV parser (no external dependency).
 * For production, replace with papaparse.
 */
@Injectable()
export class CsvParser implements IFileParser {
  supports(fileName: string): boolean {
    return fileName.toLowerCase().endsWith('.csv');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  parse(buffer: Buffer, _fileName: string): ParseResult {
    const errors: Array<{ row: number; message: string }> = [];
    const features: ParseResult['features'] = [];
    const geometryTypes = new Set<string>();

    try {
      const content = buffer.toString('utf-8');
      const lines = content
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0);

      if (lines.length < 2) {
        errors.push({
          row: 0,
          message: 'CSV must have a header row and at least one data row',
        });
        return {
          features,
          errors,
          metadata: { featureCount: 0, geometryTypes: [] },
        };
      }

      // Parse header
      const headers = this.parseCsvRow(lines[0]);
      const latCols = ['lat', 'latitude', 'lat_deg', 'y'];
      const lngCols = ['lng', 'lon', 'longitude', 'long', 'x'];
      const wktCols = ['wkt', 'geometry', 'geom', 'the_geom'];

      const latIndex = headers.findIndex((h) =>
        latCols.includes(h.toLowerCase().trim()),
      );
      const lngIndex = headers.findIndex((h) =>
        lngCols.includes(h.toLowerCase().trim()),
      );
      const wktIndex = headers.findIndex((h) =>
        wktCols.includes(h.toLowerCase().trim()),
      );

      if (latIndex === -1 && wktIndex === -1) {
        errors.push({
          row: 0,
          message:
            'Could not detect spatial columns. Expected: lat/lng (latitude, longitude) or WKT column',
        });
        return {
          features,
          errors,
          metadata: { featureCount: 0, geometryTypes: [] },
        };
      }

      for (let i = 1; i < lines.length; i++) {
        try {
          const values = this.parseCsvRow(lines[i]);
          if (values.length !== headers.length) {
            errors.push({
              row: i + 1,
              message: `Row ${i + 1}: Column count mismatch`,
            });
            continue;
          }

          const properties: Record<string, unknown> = {};
          headers.forEach((header, idx) => {
            if (idx !== latIndex && idx !== lngIndex && idx !== wktIndex) {
              properties[header.trim()] = this.parseValue(values[idx]);
            }
          });

          if (latIndex >= 0 && lngIndex >= 0) {
            const lat = parseFloat(values[latIndex]);
            const lng = parseFloat(values[lngIndex]);
            if (isNaN(lat) || isNaN(lng)) {
              errors.push({
                row: i + 1,
                message: `Row ${i + 1}: Invalid lat/lng values`,
              });
              continue;
            }
            features.push({
              geometry: {
                type: 'Point',
                coordinates: [lng, lat],
              },
              properties,
              name: (properties.name as string) ?? `Point ${i}`,
            });
            geometryTypes.add('Point');
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Parse error';
          errors.push({ row: i + 1, message: `Row ${i + 1}: ${message}` });
        }
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unknown parse error';
      errors.push({ row: 0, message: `CSV parse error: ${message}` });
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

  private parseCsvRow(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }

  private parseValue(value: string): unknown {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    if (trimmed.toLowerCase() === 'true') return true;
    if (trimmed.toLowerCase() === 'false') return false;
    if (!isNaN(Number(trimmed))) return Number(trimmed);
    return trimmed;
  }
}
