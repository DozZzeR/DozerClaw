---
name: structured-output
description: Use when DozerClaw asks a model to produce JSON or schema-constrained output, especially through Codex CLI --output-schema. Explains how to satisfy strict JSON Schema and avoid invalid or chatty responses.
---

# Structured Output Skill

When the application provides a JSON Schema, your final response must be one
valid JSON value that conforms to that schema. Return no Markdown, no code
fences, no prose before or after the JSON.

## Codex CLI Schema Rules

- Every field declared in `properties` must be listed in `required`.
- Optional fields are represented by allowing `null`, for example
  `type: ["string", "null"]`.
- If a field is not relevant to the selected intent, set it to `null`.
- Respect `additionalProperties: false`; do not add keys that are not in the
  schema.
- Respect enum values exactly.

## Intent Routing Rules

- Use `ask_clarification` when the next deterministic action is uncertain.
- Use `store_file` only when the message contains an attachment or link that
  should be stored.
- Use `record_fact` only for durable family facts, not casual comments.
- Use `create_reminder` only for an explicit reminder/task request.
- Use `answer_from_memory` only when the user is asking to recall known context.
- Use `unsupported` when the request is outside the available actions.

## Bad Outputs

Do not return:

- Markdown fences such as ```json.
- A natural-language explanation around JSON.
- A partial object missing nullable fields required by the schema.
- Guessed metadata presented as fact.
