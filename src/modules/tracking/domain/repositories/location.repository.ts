export interface LocationPointPayload {
  sessionId: string;
  deviceId: string;
  lat: number;
  lng: number;
  altitude?: number | null;
  speed?: number | null;
  bearing?: number | null;
  accuracy?: number | null;
  timestamp: Date;
}

export interface ILocationRepository {
  /**
   * Bulk insert locations ensuring high throughput (TimescaleDB integration).
   */
  saveBatch(points: LocationPointPayload[]): Promise<void>;
}

export const LOCATION_REPOSITORY = Symbol('LOCATION_REPOSITORY');
