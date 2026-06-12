export enum MatchTypePatron {
  Contains = 'CONTAINS',
  StartsWith = 'STARTS_WITH',
  Regex = 'REGEX',
}

export interface Patron {
  readonly id: string;
  readonly bucketName: string;
  readonly label: string | null;
  readonly icon: string | null;
  readonly expression: string;
  readonly matchType: MatchTypePatron;
  readonly priority: number;
  readonly active: boolean;
}

export interface PatronInput {
  readonly bucketName: string;
  readonly label?: string | null;
  readonly icon?: string | null;
  readonly expression: string;
  readonly matchType: MatchTypePatron;
  readonly priority: number;
  readonly active?: boolean;
}
