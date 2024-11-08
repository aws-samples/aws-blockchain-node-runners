const asgAvailabilityZones: Map<string, Array<string>> = new Map([
  ["dev", ['a', 'b', 'c']],
  ["prod", ['a', 'b', 'c', 'd', 'f']],
]);

export function getASGAvailabilityZones(stage: string, region: string): string[] {
  const azs = asgAvailabilityZones.get(stage) || [];
  return azs.map((az) => region + az);
}

export function getASGAvailabilityZonesCount(stage: string): number {
  const azs = asgAvailabilityZones.get(stage) || [];
  return azs.length;
}

export function getServiceAvailabilityZones(stage: string, region: string): string[] {
  return ['a', 'b', 'c', 'd', 'e', 'f'].map((az) => region + az);
}
