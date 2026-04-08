export class IngestLocationCommand {
  constructor(
    public readonly deviceId: string,
    public readonly lat: number,
    public readonly lng: number,
    public readonly timestamp: string,
    public readonly speed?: number,
  ) {}
}
