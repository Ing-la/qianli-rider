export interface PigmentDef {
  id: 0 | 1 | 2;
  name: string;
  short: string;
  color: number;
  score: number;
}

export const PIGMENTS: readonly PigmentDef[] = [
  { id: 0, name: '石青', short: '青', color: 0x3f6ea6, score: 150 },
  { id: 1, name: '石绿', short: '绿', color: 0x4f8a63, score: 120 },
  { id: 2, name: '赭石', short: '赭', color: 0xa05c33, score: 100 },
] as const;

export const CARRY_CAPACITY = 6;
// 3 deliveries per region keeps a full palette run reachable inside the 8-minute limit.
export const DELIVERIES_PER_REGION = 3;
