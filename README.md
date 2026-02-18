# notify-bot-pr-event-action

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/suzuki-shunsuke/notify-bot-pr-event-action)

**notify-bot-pr-event-action** is a GitHub Action that notifies users about updates to pull requests created by GitHub Apps or machine users (hereafter referred to as “bots”).

![approve](https://github.com/user-attachments/assets/020c7c38-79ee-4b7c-8d8d-4a09ad360b90)

![merge](https://github.com/user-attachments/assets/afb3e303-8e91-4e32-a4b8-59e8549dd2a1)

It improves the experience of working with bot-created PRs.

Consider the following cases:

- You modify a PR created by a bot such as Dependabot or Renovate and want other people to review it.
- You create a PR using a tool like Devin (where the PR author is Devin) and want other people to review it.

The key difference from ordinary PRs is that the PR author is a bot rather than a human.
As tools like Devin become more common, we can expect to see more PRs created by AI agents.

When a PR is authored by a human, the author can receive notifications about events such as reviews, merges, or closures through GitHub’s standard features or integrations with chat tools like Slack.
However, when the PR author is a bot, no one receives these notifications. As a result, even if a PR is being reviewed, it may be left unattended because no one notices the activity.
This becomes particularly problematic in teams that follow the convention that `it is the author—not the reviewer—who is responsible for merging the PR`.

**notify-bot-pr-event-action** addresses this problem by posting comments on the PR when events such as reviews, merges, or closures occur. It mentions relevant users—such as committers or assignees—to ensure that humans are properly notified about these events.

## Notified Events

- pull_request_review
  - approved
  - request changes
  - comment
- pull_request
  - merged
  - closed

## Notified Users

- committers
- commit author
- commit co-authors
- assignees
- approvers

The following users are excluded.

- `github.actor`
- machine_users
- GitHub Apps

## How To Use

```yaml
---
name: Notify bot pr event
on:
  pull_request:
    types: [closed]
  pull_request_review:
    types: [submitted]
jobs:
  notify-bot-pr-event:
    # Filter events
    # pr author: Bot
    if: |
      endsWith(github.event.pull_request.user.login, '[bot]') &&
      ((github.event_name == 'pull_request_review' && github.event.review.state == 'approved') ||
      github.event_name == 'pull_request')
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    permissions:
      pull-requests: write # To post pr comments
      contents: read # To read commits
    steps:
      - uses: suzuki-shunsuke/notify-bot-pr-event-action@latest
```
