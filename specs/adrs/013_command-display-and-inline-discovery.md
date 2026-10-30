# ADR-013: Retained command text and inline discovery

Date: 2026-10-30

Status: Accepted

Affects: REQ-SH-001, REQ-SH-002, REQ-SH-003, REQ-SH-004

## Context

Clearing a successfully submitted command exposes rotating example placeholders. Those examples look like the active function, making the bar misleading. The operator requests a blank idle field, a small inline autocomplete button and the actual launch command while a function is active.

## Decision

Remove the example list, index and timer. An inline chevron button toggles all registered functions, including while a command with a tail is displayed, without altering the input. Automatic typing completion and empty-field Down/Right discovery remain. Explicit selection launches the chosen function with no inherited tail.

Keep the normalized, trimmed submitted text in the input and on the invocation. Internal navigation does not rewrite that original launch text. Function input ownership and buffering remain native and independent of the displayed command string. Invalid submissions still clear and show inline error feedback, the intentional correction exception. Cancellation clears the field.

Escape/Focus Command selects an unchanged submitted command for replacement, avoiding accidental concatenation when the operator types another mnemonic. An edited command draft retains its text. Direct pointer editing retains native insertion behavior. Focus alone does not open autocomplete; typing or explicit discovery does. Tab on an unchanged launch command with autocomplete closed resumes function input, preserving the keyboard return path.

## Consequences

One field remains both the launch display and command editor, with no separate label, command history or second draft store. Invocation ownership supplies the comparison text; no background timer remains. Inline error feedback is still rendered in the cleared field, without suggested-command examples. Back and sibling navigation preserve their existing command-draft behavior.
