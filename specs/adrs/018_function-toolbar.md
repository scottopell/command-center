# ADR-018: A visible function toolbar

Date: 2026-11-03

Status: Accepted

Affects: REQ-SH-001, REQ-SH-003, REQ-SH-005, REQ-SH-017, REQ-NV-007, REQ-NV-012

## Context

The operator requests a bookmark-style row of all functions while their number is small. This revises the earlier restriction in REQ-SH-003 against a permanent function-list row. Pack-management copy also called the function input a command bar without defining that term.

## Decision

Add a compact native function toolbar below the function input. Use catalog order, mnemonic labels, full-title tooltips and active-function highlighting. A click launches a fresh invocation with the bare mnemonic using the existing command-execution path. The input and autocomplete remain the route for commands with tails. Hidden shortcuts move to a More menu when the row runs out of space.

Move pack management to the right end of this row. Place Back and contextual Previous/Next controls alongside the function input in the first row, removing the separate navigation row. Function content begins directly below the shortcut toolbar; transient straggler notices share the existing status footer. Refresh catalog-backed shortcuts after installation changes without rebuilding unchanged controls or changing input text/focus. In pack management, say that packs add functions to CommandCenter.

## Consequences

All installed functions have a visible or overflow shortcut. No favorites, pinning, custom ordering or additional launch semantics are introduced. Clicking the active shortcut starts over, consistently with ordinary execution. The existing invocation model applies unchanged.
