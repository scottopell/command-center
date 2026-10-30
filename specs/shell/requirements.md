# CommandCenter shell and invocation lifecycle

## User story

As the human operator, I need a predictable keyboard-driven command-center so that I can launch functions and inspect agent work without waiting for data or managing focus manually.

## Requirements

### REQ-SH-001: Use one consistent command-center window

THE SYSTEM SHALL present one command-center window with a top row containing the command input and its inline autocomplete button, one function content area, and empty, loading, and error states.
THE SYSTEM SHALL use compact typography, dark surfaces, amber content accents, and orange command text, caret, and focus cues.
THE SYSTEM SHALL normalize committed command input to uppercase, including pasted commands.
THE SYSTEM SHALL provide horizontal padding and vertically center entered text and inline error feedback within the command input.
THE SYSTEM SHALL leave an empty command input free of suggested-command placeholders or rotating examples.

**Rationale:** The operator needs a familiar, dense workspace with a clear command destination.

---

### REQ-SH-002: Launch functions with their tails intact

WHEN the operator executes a command, THE SYSTEM SHALL select the registered function using a case-insensitive mnemonic and pass the remaining tail text to that function without changing its case, punctuation, or internal spacing.
IF the mnemonic is unknown, THE SYSTEM SHALL show prominent feedback in the command input, clear the submitted command text, and retain input focus so that the operator can immediately type a correction without launching a function.
THE SYSTEM SHALL retain that feedback until the operator edits the input or dismisses the error.
WHEN a valid command is executed, THE SYSTEM SHALL retain its normalized submitted text, including tail arguments, in the command input through loading and in-function navigation until the operator edits it, submits another command or cancels. Input retention SHALL NOT redirect function type-ahead into the command bar.
WHEN the command is empty, THE SYSTEM SHALL remain at the command bar.

**Rationale:** Function-specific shortcuts must retain their meaning, including literal search text.

---

### REQ-SH-003: Discover registered functions

WHEN the operator types a mnemonic or function-title fragment in the command bar, THE SYSTEM SHALL suggest matching registered functions and permit selection by keyboard or pointer.
THE SYSTEM SHALL present suggestions in an autocomplete dropdown beneath the command input, without reserving a permanent function-list row.
WHEN the operator clicks the inline discovery button, THE SYSTEM SHALL toggle an autocomplete list of all registered functions without changing the command text, including when it contains a mnemonic and tail.
WHEN the operator presses Down or Right in an empty command input, THE SYSTEM SHALL open autocomplete with all registered functions, permitting discovery without a typed prefix.
WHEN the input is empty without an explicit discovery request, focus leaves command editing, or a function is executed, THE SYSTEM SHALL dismiss the autocomplete dropdown.
WHEN a registered mnemonic is followed by its tail separator, THE SYSTEM SHALL stop automatic mnemonic completion rather than replace the command’s tail; explicit inline discovery SHALL remain available.
THE SYSTEM SHALL leave tail interpretation to the selected function.

**Rationale:** The operator can find functions without memorizing every mnemonic.

---

### REQ-SH-004: Return immediately to the command bar

WHEN Escape is pressed while focus is outside the command bar, THE SYSTEM SHALL return focus to the command bar without cancelling the current invocation, clearing its view, discarding its draft or pending input, or aborting its work.
THE SYSTEM SHALL determine the Escape action from focus at the start of that keypress and perform only one action for that keypress.
WHEN Escape or the Focus Command action returns focus to the unchanged submitted command, THE SYSTEM SHALL select that text for replacement. An edited draft command SHALL retain its text instead. Focusing an unchanged submitted command SHALL NOT automatically reopen autocomplete. WHEN that unchanged command has focus and autocomplete is closed, Tab SHALL resume the current function rather than complete the retained text.
WHILE the command-center is empty, THE SYSTEM SHALL keep the command bar focused when Escape is pressed.

**Rationale:** The operator can prepare a new command without first destroying the function being inspected.

---

### REQ-SH-005: Start every invocation fresh

WHEN a function is launched, THE SYSTEM SHALL create a fresh invocation even if its mnemonic matches the current or a previous invocation.
THE SYSTEM SHALL discard the retired invocation’s unsent input, draft UI state, selection, and scroll state without an unsaved-changes prompt or automatic restoration.

**Rationale:** Command execution must have one predictable meaning and never revive an unrelated draft.

---

### REQ-SH-006: See a destination within the visual latency budget

WHEN a valid command is executed in the running, foreground application, THE SYSTEM SHALL display that invocation’s destination view or a destination-specific loading state within 500 milliseconds.
THE SYSTEM SHALL own post-command input continuously from command admission without waiting for resolution, mounting, or destination data.

**Rationale:** The operator needs immediate visual feedback and uninterrupted typing.

---

### REQ-SH-007: Preserve input while a function initializes

WHILE an invocation is resolving, mounting, or receiving its initial buffered input, THE SYSTEM SHALL preserve committed text and pasted text, Backspace within the current pending text segment, and forward Tab through ordinary text fields in order for that invocation.
WHEN the invocation becomes ready, THE SYSTEM SHALL apply each accepted operation once in order, allowing forward Tab to change the destination of subsequent text.
WHILE initial handoff is incomplete, THE SYSTEM SHALL visibly refuse unsupported editing or navigation without queuing it or changing accepted text.
WHEN initial handoff completes, THE SYSTEM SHALL restore ordinary browser editing, selection, shortcuts, and focus navigation, except for command-center Escape behavior.
WHILE the command bar has focus, THE SYSTEM SHALL direct new keyboard input to command editing and pause function input delivery without discarding pending input. WHEN the operator returns focus to the function, THE SYSTEM SHALL resume its handoff before accepting ordinary function input.

**Rationale:** Typing a title, Tab, and body while a function loads must behave like typing into the ready form.

---

### REQ-SH-008: Hand input to the initialized destination

WHEN tail resolution and the first resolved view commit are complete and function input ownership is active, THE SYSTEM SHALL establish the function’s declared initial focus before delivering buffered input.
IF the operator has returned focus to the command bar during initialization, THE SYSTEM SHALL allow the function to finish initialization without stealing focus or delivering buffered input until function input ownership resumes.
THE SYSTEM SHALL consume the command-execution key at the command bar rather than deliver it as a function action.

**Rationale:** The tail-selected route and prefilled fields must be correct before typing reaches the form.

---

### REQ-SH-010: Expose initialization and handoff failures

IF resolution, rendering, or initial focus fails, THE SYSTEM SHALL show a function error and SHALL NOT redirect pending input into the command bar or another invocation.
IF input cannot be delivered to its expected destination, THE SYSTEM SHALL stop delivery and show an explicit error rather than guess a replacement target.
IF the destination is read-only and cannot receive queued text, THE SYSTEM SHALL report that input as undeliverable rather than insert it into another control.
IF buffered forward Tab reaches a non-text control or leaves the resolved view, THE SYSTEM SHALL stop that handoff with an explicit unsupported-destination error rather than skip controls, invent a focus path, or move input outside the view.
THE SYSTEM SHALL keep Escape available from an error state.

**Rationale:** A visible failure is preferable to text or actions reaching the wrong destination.

---

### REQ-SH-011: Release retired invocation ownership

WHEN an invocation is retired, THE SYSTEM SHALL prevent its late results from mounting content, claiming focus, or receiving current input.
THE SYSTEM SHALL disconnect the retired invocation's bridge and input ownership, unmount its view, and release platform-owned view, callback, and data references without a preservation grace period.

**Rationale:** Repeated use must not accumulate stale views or let old work take over the command-center.

---

### REQ-SH-012: Leave submitted work independent of the view

WHEN an invocation is retired, THE SYSTEM SHALL leave already accepted backend operations and persisted records independent of that retirement.

**Rationale:** An operator can leave a function without deleting its data or implying that a submitted action was undone.

---

### REQ-SH-013: Submit only after readiness

WHILE resolution, mounting, or initial input handoff is incomplete, THE SYSTEM SHALL visibly refuse submission attempts, including Return, submission shortcuts, and pointer activation, without queuing them, submitting work, or modifying accepted text.
WHEN initial handoff completes, THE SYSTEM SHALL require a new explicit submission action rather than replay an action refused during loading.
THE SYSTEM SHALL permit pasted text to contain line breaks and restore ordinary Return behavior, including textarea line breaks, after handoff.

**Rationale:** The operator retains the useful title/Tab/body shortcut without delayed actions firing after initialization.

---

### REQ-SH-014: Cancel a function from the command bar

WHEN Escape is pressed while the command bar has focus and a current invocation exists, THE SYSTEM SHALL cancel that invocation, display the empty state, and keep focus in the command bar without awaiting resolution, network activity, or application cleanup.
THE SYSTEM SHALL treat cancel as retirement of that invocation, including discarding its unsent input and draft, aborting its UI lifetime, and refusing late UI effects or new bridge calls.
THE SYSTEM SHALL leave already admitted backend operations and committed application data independent of cancel.

**Rationale:** The operator can deliberately discard a function using Escape from a known focus location, including when the command bar was focused directly.

### REQ-SH-015: Open sources outside the function document

WHEN the operator explicitly opens a source after the function is interactive, THE SYSTEM SHALL validate the destination and open an allowed web URL outside the function document.
THE SYSTEM SHALL refuse external opening during loading, from retired invocations, and for unsupported schemes or destinations.
THE SYSTEM SHALL prevent external pages and subframes from replacing trusted function content or gaining its native bridge authority.

**Rationale:** Source handoffs must preserve keyboard ownership and keep application privileges attached to bundled function code.

---

### REQ-SH-016: Copy intentionally selected display text

WHEN the operator finishes a pointer or keyboard selection of nonempty displayed text in the active interactive function, THE SYSTEM SHALL copy that text as plain text to the system clipboard. THE SYSTEM SHALL exclude command fields, inputs, textareas and editable content, and SHALL NOT copy empty selections, covered-screen text or selections restored programmatically without a selection gesture. Mixed selections intersecting editable controls SHALL be ignored rather than partially copied. Deselecting text SHALL NOT clear the clipboard. THE SYSTEM SHALL keep ordinary explicit Copy available. Clipboard writes SHALL be generation- and entry-scoped, limited to 2 MiB of UTF-8 text and report write failure or a size refusal visibly without storing a clipboard history or sending the selection to a worker.

**Rationale:** Reading and extracting displayed information should require only selection without disrupting select-then-paste editing.


## Deprecated requirements

These records retain permanent IDs and their original text. They are historical obligations and are not part of the active contract.

### REQ-SH-009: Keep early actions attached to their invocation

**DEPRECATED:** Replaced by REQ-SH-013. See [ADR-004](../adrs/004_loading-input-fidelity.md). The original obligation below is retained as history and is not an active contract.

WHEN a submission or other action is entered while an invocation loads, THE SYSTEM SHALL execute it only after the initialized destination has received all preceding accepted input.
IF that invocation is retired first, THE SYSTEM SHALL discard the unexecuted action.

**Rationale:** Fast operators can finish a familiar sequence without waiting, without sending it to another view.
