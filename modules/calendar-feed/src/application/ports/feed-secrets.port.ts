export interface IssuedFeedSecret {
  secret: string;
  hash: string;
}

export interface IFeedSecrets {
  issue(): IssuedFeedSecret;

  hashOf(secret: string): string;
}
