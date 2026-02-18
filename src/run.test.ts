import { describe, it, expect } from "vitest";
import { collectUsersToNotify, filterUsers, formatComment } from "./run";
import type { Input } from "./lib";
import type { PullRequestCommit, Review, User } from "./type";

const makeInput = (overrides: Partial<Input> = {}): Input => ({
  githubToken: "",
  repositoryOwner: "owner",
  repositoryName: "repo",
  pullRequestNumber: 1,
  machineUsers: new Set<string>(),
  actor: "actor",
  eventName: "pull_request",
  eventAction: "closed",
  prMerged: true,
  reviewState: "",
  ...overrides,
});

const makeCommit = (
  committerLogin: string | null,
  authorLogins: (string | null)[] = [],
): PullRequestCommit => ({
  commit: {
    oid: "abc123",
    committer: {
      user: committerLogin
        ? { login: committerLogin, resourcePath: `/${committerLogin}` }
        : null,
    },
    authors: {
      nodes: authorLogins.map((login) => ({
        user: login ? { login, resourcePath: `/${login}` } : null,
      })),
    },
  },
});

const makeReview = (login: string, state: string): Review => ({
  state,
  commit: { oid: "abc123" },
  author: { login, resourcePath: `/${login}` },
});

const makeAssignee = (login: string): User => ({
  login,
  resourcePath: `/${login}`,
});

describe("collectUsersToNotify", () => {
  it("collects committer logins", () => {
    const input = makeInput();
    const commits = [makeCommit("committer1", [])];
    const result = collectUsersToNotify(input, commits, [], []);
    expect(result).toContain("committer1");
  });

  it("collects author logins from authors.nodes", () => {
    const input = makeInput();
    const commits = [makeCommit(null, ["author1", "author2"])];
    const result = collectUsersToNotify(input, commits, [], []);
    expect(result).toContain("author1");
    expect(result).toContain("author2");
  });

  it("collects multiple co-authors from a single commit", () => {
    const input = makeInput();
    const commits = [makeCommit("committer1", ["author1", "author2"])];
    const result = collectUsersToNotify(input, commits, [], []);
    expect(result).toContain("committer1");
    expect(result).toContain("author1");
    expect(result).toContain("author2");
  });

  it("skips null users", () => {
    const input = makeInput();
    const commits = [makeCommit(null, [null])];
    const result = collectUsersToNotify(input, commits, [], []);
    expect(result.size).toBe(0);
  });

  it("collects approvers for pull_request closed events", () => {
    const input = makeInput({
      eventName: "pull_request",
      eventAction: "closed",
    });
    const reviews = [makeReview("approver1", "APPROVED")];
    const result = collectUsersToNotify(input, [], reviews, []);
    expect(result).toContain("approver1");
  });

  it("does not collect approvers for pull_request_review events", () => {
    const input = makeInput({
      eventName: "pull_request_review",
      eventAction: "submitted",
    });
    const reviews = [makeReview("approver1", "APPROVED")];
    const result = collectUsersToNotify(input, [], reviews, []);
    expect(result).not.toContain("approver1");
  });

  it("collects assignees", () => {
    const input = makeInput();
    const assignees = [makeAssignee("assignee1")];
    const result = collectUsersToNotify(input, [], [], assignees);
    expect(result).toContain("assignee1");
  });

  it("deduplicates users", () => {
    const input = makeInput();
    const commits = [makeCommit("user1", ["user1"])];
    const assignees = [makeAssignee("user1")];
    const result = collectUsersToNotify(input, commits, [], assignees);
    expect(result.size).toBe(1);
    expect(result).toContain("user1");
  });
});

describe("filterUsers", () => {
  it("filters out the actor", () => {
    const users = new Set(["actor", "other"]);
    const result = filterUsers(users, "actor", new Set());
    expect(result).toEqual(["other"]);
  });

  it("filters out bot accounts", () => {
    const users = new Set(["dependabot[bot]", "user1"]);
    const result = filterUsers(users, "actor", new Set());
    expect(result).toEqual(["user1"]);
  });

  it("filters out machine users", () => {
    const users = new Set(["ci-bot", "user1"]);
    const result = filterUsers(users, "actor", new Set(["ci-bot"]));
    expect(result).toEqual(["user1"]);
  });

  it("keeps normal users", () => {
    const users = new Set(["user1", "user2"]);
    const result = filterUsers(users, "actor", new Set());
    expect(result).toEqual(["user1", "user2"]);
  });
});

describe("formatComment", () => {
  it("formats merged PR message", () => {
    const input = makeInput({
      eventName: "pull_request",
      eventAction: "closed",
      prMerged: true,
    });
    const result = formatComment(["user1", "user2"], input);
    expect(result).toBe("@user1 @user2 Merged the pull request.");
  });

  it("formats closed PR message", () => {
    const input = makeInput({
      eventName: "pull_request",
      eventAction: "closed",
      prMerged: false,
    });
    const result = formatComment(["user1"], input);
    expect(result).toBe("@user1 Closed the pull request.");
  });

  it("formats pull_request_review approved message", () => {
    const input = makeInput({
      eventName: "pull_request_review",
      reviewState: "approved",
    });
    const result = formatComment(["user1"], input);
    expect(result).toBe("@user1 The pull request was approved.");
  });

  it("formats pull_request_review changes_requested message", () => {
    const input = makeInput({
      eventName: "pull_request_review",
      reviewState: "changes_requested",
    });
    const result = formatComment(["user1"], input);
    expect(result).toBe("@user1 Changes were requested.");
  });

  it("formats pull_request_review commented message", () => {
    const input = makeInput({
      eventName: "pull_request_review",
      reviewState: "commented",
    });
    const result = formatComment(["user1"], input);
    expect(result).toBe("@user1 A comment was left on the pull request.");
  });

  it("includes all user mentions", () => {
    const input = makeInput({ prMerged: true });
    const result = formatComment(["a", "b", "c"], input);
    expect(result).toContain("@a @b @c");
  });
});
