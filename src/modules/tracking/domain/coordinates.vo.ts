export class Coordinates {
  private constructor(
    readonly latitude: number,
    readonly longitude: number,
  ) {}

  static create(lat: number, lng: number): Coordinates {
    if (lat < -90 || lat > 90) throw new Error('Invalid latitude');
    if (lng < -180 || lng > 180) throw new Error('Invalid longitude');
    return new Coordinates(lat, lng);
  }
}
