export function getKeySetUniqueString(keySet: string[]): string {
  return keySet.sort().join('-');
}

export function getGenesisFileName(keySet: string[]): string {
  return `genesis-${getKeySetUniqueString(keySet)}.json`;
}

export function getBootnodesFileName(keySet: string[]): string {
  return `static-nodes-${getKeySetUniqueString(keySet)}.json`;
}
