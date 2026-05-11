import { CsvParser } from './csv.parser';

describe('CsvParser', () => {
  const parser = new CsvParser();

  describe('supports', () => {
    it('should support .csv files', () => {
      expect(parser.supports('data.csv')).toBe(true);
    });

    it('should not support other files', () => {
      expect(parser.supports('data.geojson')).toBe(false);
      expect(parser.supports('data.json')).toBe(false);
    });
  });

  describe('parse', () => {
    it('should parse CSV with lat/lng columns', () => {
      const csv =
        'name,latitude,longitude,value\nPoint A,10.5,106.7,100\nPoint B,11.0,107.0,200\n';
      const result = parser.parse(Buffer.from(csv), 'points.csv');

      expect(result.features).toHaveLength(2);
      expect(result.errors).toHaveLength(0);

      expect(result.features[0].name).toBe('Point A');
      expect(result.features[0].geometry).toEqual({
        type: 'Point',
        coordinates: [106.7, 10.5],
      });
      expect(result.features[0].properties).toEqual({
        name: 'Point A',
        value: 100,
      });

      expect(result.features[1].name).toBe('Point B');
      expect(result.features[1].geometry).toEqual({
        type: 'Point',
        coordinates: [107.0, 11.0],
      });
      expect(result.features[1].properties).toEqual({
        name: 'Point B',
        value: 200,
      });
    });

    it('should handle alternate column names', () => {
      const csv = 'city,lat_deg,lng,pop\nCity A,10.5,106.7,5000\n';
      const result = parser.parse(Buffer.from(csv), 'cities.csv');

      expect(result.features).toHaveLength(1);
      // Name falls back to "Point {index}" when no 'name' column exists
      expect(result.features[0].name).toBe('Point 1');
      expect(result.features[0].geometry).toEqual({
        type: 'Point',
        coordinates: [106.7, 10.5],
      });
      expect(result.features[0].properties).toEqual({
        city: 'City A',
        pop: 5000,
      });
    });

    it('should handle quoted CSV fields', () => {
      const csv =
        'name,lat,lng,description\n"Point, A",10.5,106.7,"This is a ""nice"" point"\n';
      const result = parser.parse(Buffer.from(csv), 'quoted.csv');

      expect(result.features).toHaveLength(1);
      expect(result.features[0].name).toBe('Point, A');
      expect(result.features[0].properties.description).toBe(
        'This is a "nice" point',
      );
    });

    it('should reject CSV without spatial columns', () => {
      const csv = 'name,value,category\nA,100,X\nB,200,Y\n';
      const result = parser.parse(Buffer.from(csv), 'no-spatial.csv');

      expect(result.features).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain(
        'Could not detect spatial columns',
      );
    });

    it('should skip rows with invalid coordinates', () => {
      const csv = 'name,lat,lng\nValid,10.5,106.7\nInvalid,notanumber,106.7\n';
      const result = parser.parse(Buffer.from(csv), 'mixed.csv');

      expect(result.features).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Invalid lat/lng');
    });

    it('should handle empty file', () => {
      const result = parser.parse(Buffer.from(''), 'empty.csv');
      expect(result.features).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
    });

    it('should parse boolean and numeric properties', () => {
      const csv = 'name,lat,lng,active,count\nA,10.5,106.7,true,42\n';
      const result = parser.parse(Buffer.from(csv), 'typed.csv');

      expect(result.features[0].properties.active).toBe(true);
      expect(result.features[0].properties.count).toBe(42);
    });
  });
});
