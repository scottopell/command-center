# DRQS development requests

## User story

As a human triager or coding agent, I need to file findings, inspect queues, and exchange recorded updates so that the responsible group can act without losing the original report or conversation.

## Requirements

### REQ-DR-001: Choose stable routing groups

THE SYSTEM SHALL expose a shared project group directory with stable numeric identifiers, names, and exact slugs, including an Inbox for unclassified work.
WHEN a request names an unknown group, THE SYSTEM SHALL reject it without creating or rerouting a ticket.

**Rationale:** Humans and agents need unambiguous project destinations shared by tails, forms, and APIs. Ticket type describes the kind of work separately from project ownership.

---

### REQ-DR-002: Inspect and search request queues

THE SYSTEM SHALL show all open requests or one group’s open requests, with title, ticket number, type, state, group, owner, and update time.
THE SYSTEM SHALL support state and type filtering and literal case-insensitive search across ticket number, title, original body, and comments.
THE SYSTEM SHALL treat Q, A, and N as open and provide an all-states view.
WHEN the operator explicitly refreshes, THE SYSTEM SHALL show the latest committed data without replacing an in-progress form draft.

**Rationale:** Triagers need to find the next action and agents need searchable shared evidence.

---

### REQ-DR-003: Navigate directly with tails

WHEN DRQS has no tail, THE SYSTEM SHALL open the all-open queue.
WHEN the tail is G followed by a group number or exact slug, THE SYSTEM SHALL open that group’s open queue.
WHEN the tail is S followed by text, THE SYSTEM SHALL search across all states using everything after S as literal text.
WHEN the tail is A with an optional group, THE SYSTEM SHALL open a fresh add form and preselect the supplied group.
WHEN the tail is a positive ticket number, THE SYSTEM SHALL open that ticket.
THE SYSTEM SHALL interpret action letters case-insensitively and reject unknown actions, extra operands, unknown groups, and missing required operands.
THE SYSTEM SHALL consume command-separator whitespace while preserving internal search spacing and punctuation, and SHALL NOT reinterpret search words as additional commands.

**Rationale:** Frequent actions should fit into a short command without ambiguous interpretation or side effects.

---

### REQ-DR-004: File a request with predictable defaults

WHEN a valid request is submitted, THE SYSTEM SHALL record its title, original body, group, type, creator, and requesters, assign a unique ticket number, and initialize state Q with no owner.
THE SYSTEM SHALL require a nonblank title of at most 240 characters, a nonblank body of at most 100000 characters, a known group, a valid type, and at least one requester.
THE SYSTEM SHALL default type to BF and allow BF, EN, OU, WP, and MO.

**Rationale:** A finding needs enough context and a destination to become actionable.

---

### REQ-DR-005: Enter title and body without waiting

WHEN DRQS A 42 is executed for an existing group 42, THE SYSTEM SHALL open a fresh add form with group 42 selected and initial focus on Title.
WHEN the operator types title text, Tab, and body text before the form is ready, THE SYSTEM SHALL populate Title and Body respectively in that order.
THE SYSTEM SHALL place Body immediately after Title in ordinary Tab order, with other add-form fields afterward.

**Rationale:** The operator’s practiced typing sequence should work independently of initialization speed.

---

### REQ-DR-006: Read a permanent report and its history

WHEN a ticket is opened, THE SYSTEM SHALL show its original report, current routing and ownership, creator, requesters, and ordered comments and field-change history.
THE SYSTEM SHALL preserve original submitted title and body and SHALL NOT offer editing or deletion of submitted reports or history.
THE SYSTEM SHALL render submitted text literally rather than execute it as markup.

**Rationale:** The conversation must remain trustworthy and preserve the evidence that started the work.

---

### REQ-DR-007: Post findings and route work together

WHEN an update is submitted, THE SYSTEM SHALL append its nonblank comment and any requested changes to group, state, type, or owner as one recorded operation.
THE SYSTEM SHALL leave omitted fields unchanged and reject an update that contains neither a nonblank comment nor a change.
THE SYSTEM SHALL expose Q Open, A Acknowledged, N Needs information, W Withdrawn, and R Resolved, permitting explicit transitions between those states, including reopening.

**Rationale:** An agent can hand off a finding with its explanation without overwriting unrelated contributions.

---

### REQ-DR-008: Keep ownership distinct from routing

THE SYSTEM SHALL distinguish the ticket’s routing group from its optional implementation owner.
THE SYSTEM SHALL permit setting and explicitly clearing an owner without changing routing or state unless those changes are also requested.
WHEN an owner is supplied, THE SYSTEM SHALL require an employee email reference without treating its format as proof of employee identity.

**Rationale:** Moving a conversation and assigning the person implementing a fix are different triage actions.

---

### REQ-DR-009: Distinguish authors from requesters

THE SYSTEM SHALL identify an update’s author as a human or agent and record requester references separately as employee or customer references.
WHEN a human files a request without explicit requesters, THE SYSTEM SHALL use that configured human identity as the requester.
WHEN an agent files a request, THE SYSTEM SHALL require explicit requester references.
THE SYSTEM SHALL describe local actor attribution as client-supplied rather than verified employee sign-in.

**Rationale:** Agents can report on behalf of people without impersonating them or obscuring who performed an action.

---

### REQ-DR-010: Use ticket numbers through the local API

THE SYSTEM SHALL let local agent clients list groups, list or search requests, create requests, read a ticket, post comments, and change routing, state, type, or ownership using stable ticket numbers.
THE SYSTEM SHALL preserve every committed comment from concurrent clients and order committed updates consistently.
THE SYSTEM SHALL reject missing tickets and invalid field values explicitly.

**Rationale:** Coding agents need the complete triage journey without a browser session.
