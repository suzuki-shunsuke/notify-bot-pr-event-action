export type Input = {
  githubToken: string;
  repositoryOwner: string;
  repositoryName: string;
  pullRequestNumber: number;
  machineUsers: Set<string>;
  actor: string;
  eventName: string;
  eventAction: string;
  prMerged: boolean;
  reviewState: string;
};
