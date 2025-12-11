# BeemSpec

BeemSpec is a simple product management tool that dramatically improves the output of coding agents like Cursor, Claude Code, Codex, etc.

It's based on these key principles:

* LLMs as a collaboration tool, not a replacement

* Precise LLM output requires precise context management

* Great product management doesn't get in your way

* Product and engineering handoff must be smooth as possible

* Stakeholder alignment at a high level is foundational to scaling a business

* Story maps & roadmaps are upstream to PM tools like GitHub Projects, Linear, Jira, etc

## How it works

At a high level:

1. You build the story map, starting with the high level user journey

2. BeemSpec enforces a high product management standard for each issue
  * Clear requirements
  * Proper user story structure
  * (Figma) design link if applicable
  * Edge cases to consider

3. You slice a release based on a group of stories and hand-off to engineering

4. BeemSpec generates a detailed, comprehensive implementation plan for use in any coding agent based on your codebase and style

5. Engineering reviews and steers the output

## Features

* Easy story map builder UI
  * Personas
  * User journey (steps, actions)
  * Stories
  * Release slicing

* Requirements quality scoring

* MCP integration for coding agents to pull context and update status

* Enforces codebase consistency and quality

* (Coming soon) Sync with GitHub, Linear, and Jira for execution-layer PM tooling
