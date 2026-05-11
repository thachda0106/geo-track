import { GeoJsonParser } from './geo-json.parser';

describe('GeoJsonParser', () => {
  const parser = new GeoJsonParser();

  describe('supports', () => {
    it('should support .geojson files', () => {
      expect(parser.supports('data.geojson')).toBe(true);
    });

    it('should support .json files', () => {
      expect(parser.supports('data.json')).toBe(true);
    });

    it('should not support other files', () => {
      expect(parser.supports('data.csv')).toBe(false);
      expect(parser.supports('data.gpx')).toBe(false);
      expect(parser.supports('data.kml')).toBe(false);
    });
  });

  describe('parse', () => {
    it('should parse a FeatureCollection with multiple features', () => {
      const input = JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [100, 0] },
            properties: { name: 'Point 1' },
          },
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                [100, 0],
                [101, 1],
              ],
            },
            properties: { name: 'Line 1' },
          },
        ],
      });

      const result = parser.parse(Buffer.from(input), 'test.geojson');

      expect(result.features).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
      expect(result.metadata.featureCount).toBe(2);
      expect(result.metadata.geometryTypes).toContain('Point');
      expect(result.metadata.geometryTypes).toContain('LineString');
    });

    it('should parse a single Feature', () => {
      const input = JSON.stringify({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
              [0, 0],
            ],
          ],
        },
        properties: { name: 'Test Polygon' },
      });

      const result = parser.parse(Buffer.from(input), 'single.geojson');

      expect(result.features).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      expect(result.features[0].name).toBe('Test Polygon');
      expect(result.features[0].geometry.type).toBe('Polygon');
    });

    it('should report errors for invalid features in collection', () => {
      const input = JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [100, 0] },
            properties: {},
          },
          {
            type: 'NotFeature',
            geometry: { type: 'Point', coordinates: [101, 0] },
            properties: {},
          },
        ],
      });

      const result = parser.parse(Buffer.from(input), 'mixed.geojson');

      expect(result.features).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Not a valid Feature');
    });

    it('should reject invalid root types', () => {
      const input = JSON.stringify({
        type: 'NotGeoJSON',
        data: [],
      });

      const result = parser.parse(Buffer.from(input), 'invalid.geojson');

      expect(result.features).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain(
        'FeatureCollection or Feature',
      );
    });

    it('should handle invalid JSON syntax', () => {
      const result = parser.parse(Buffer.from('not valid json'), 'bad.geojson');

      expect(result.features).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Invalid GeoJSON');
    });

    it('should use filename as default name for single Feature', () => {
      const input = JSON.stringify({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [100, 0] },
        properties: {},
      });

      const result = parser.parse(Buffer.from(input), 'survey-point.geojson');

      expect(result.features[0].name).toBe('survey-point');
    });

    it('should extract name from properties', () => {
      const input = JSON.stringify({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [100, 0] },
        properties: { name: 'Custom Name' },
      });

      const result = parser.parse(Buffer.from(input), 'file.geojson');

      expect(result.features[0].name).toBe('Custom Name');
    });
  });
});
