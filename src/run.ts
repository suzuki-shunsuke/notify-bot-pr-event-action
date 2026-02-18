import * as core from "@actions/core";
import { context } from "@actions/github";
import * as github from "./github";
import * as lib from "./lib";
import * as type from "./type";

export const main = async () => {
  const machineUsersRaw = core.getMultilineInput("machine_users");
  const machineUsers = new Set(
    machineUsersRaw.filter((a) => !a.startsWith("#")),
  );

  const input: lib.Input = {
    githubToken: core.getInput("github_token"),
    repositoryOwner: context.repo.owner,
    repositoryName: context.repo.repo,
    pullRequestNumber: context.payload.pull_request?.number ?? 0,
    machineUsers: machineUsers,
    actor: context.actor,
    eventName: context.eventName,
    eventAction: context.payload.action ?? "",
    prMerged: context.payload.pull_request?.merged ?? false,
    reviewState: context.payload.review?.state ?? "",
  };

  await run(input);
};

const run = async (input: lib.Input): Promise<void> => {
  // 1. Fetch PR data
  const prData = await github.getPullRequest(input);
  const pr = prData.repository.pullRequest;

  // 2. Paginate commits if needed
  let commits = pr.commits.nodes;
  if (pr.commits.pageInfo.hasNextPage && pr.commits.pageInfo.endCursor) {
    const additionalCommits = await github.listCommits(
      input,
      pr.commits.pageInfo.endCursor,
    );
    commits = [...commits, ...additionalCommits];
  }

  // 3. Paginate reviews if needed
  let reviews = pr.reviews.nodes;
  if (pr.reviews.pageInfo.hasNextPage && pr.reviews.pageInfo.endCursor) {
    const additionalReviews = await github.listReviews(
      input,
      pr.reviews.pageInfo.endCursor,
    );
    reviews = [...reviews, ...additionalReviews];
  }

  // 4. Collect users to notify
  const users = collectUsersToNotify(
    input,
    commits,
    reviews,
    pr.assignees.nodes,
  );

  // 5. Filter out actor, bots, and machine users
  const filteredUsers = filterUsers(users, input.actor, input.machineUsers);

  // 6. Exit if no users to notify
  if (filteredUsers.length === 0) {
    core.info("No users to notify after filtering");
    return;
  }

  // 7. Format and post comment
  const message = formatComment(filteredUsers, input);
  const result = await github.postComment(input, message);
  core.info(`Comment posted: ${result.htmlUrl}`);
};

const collectUsersToNotify = (
  input: lib.Input,
  commits: type.PullRequestCommit[],
  reviews: type.Review[],
  assignees: type.User[],
): Set<string> => {
  const users = new Set<string>();

  // Always collect committers (for both pull_request and pull_request_review events)
  for (const node of commits) {
    if (node.commit.committer.user) {
      users.add(node.commit.committer.user.login);
    }
    for (const author of node.commit.authors.nodes) {
      if (author.user) {
        users.add(author.user.login);
      }
    }
  }

  // For pull_request events (closed/merged), also collect approvers and assignees
  if (input.eventName === "pull_request" && input.eventAction === "closed") {
    for (const review of reviews) {
      if (review.state === "APPROVED") {
        users.add(review.author.login);
      }
    }
  }
  for (const assignee of assignees) {
    users.add(assignee.login);
  }

  return users;
};

const filterUsers = (
  users: Set<string>,
  actor: string,
  machineUsers: Set<string>,
): string[] => {
  return Array.from(users).filter((login) => {
    // Filter out the actor
    if (login === actor) {
      return false;
    }
    // Filter out bot accounts
    if (login.includes("[bot]")) {
      return false;
    }
    // Filter out machine users
    if (machineUsers.has(login)) {
      return false;
    }
    return true;
  });
};

const formatComment = (users: string[], input: lib.Input): string => {
  const mentions = users.map((u) => `@${u}`).join(" ");

  let action: string;
  if (input.eventName === "pull_request") {
    if (input.prMerged) {
      action = "Merged the pull request.";
    } else if (input.eventAction === "closed") {
      action = "Closed the pull request.";
    } else {
      action = `Pull request ${input.eventAction}.`;
    }
  } else if (input.eventName === "pull_request_review") {
    switch (input.reviewState) {
      case "approved":
        action = "The pull request was approved.";
        break;
      case "changes_requested":
        action = "Changes were requested.";
        break;
      case "commented":
        action = "A comment was left on the pull request.";
        break;
      default:
        action = "A review was submitted.";
    }
  } else {
    action = `Event: ${input.eventName}/${input.eventAction}`;
  }

  return `${mentions} ${action}`;
};
