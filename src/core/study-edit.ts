// Editing a study file from a form.
//
// The form view and the text view are the same file, and that only stays true if editing is
// surgical. Parsing the document and writing it back out reformats it: the yaml library
// re-folds every block scalar and re-emits every line, which on the worked example changes 325
// lines of 373. A study file is something a person reads, with comments explaining why each
// question is there, so an edit here replaces the lines it was asked to change and leaves the
// file alone byte for byte everywhere else.
//
// Every function takes the file as text and returns it as text. Nothing is saved until
// parseStudy accepts the result, so a form cannot produce a study the editor would refuse.

import { parseStudy } from "./study-schema";

export type EditResult = { ok: true; text: string } | { ok: false; problem: string };

/**
 * The form only edits a file that already parses.
 *
 * Without this, a line-based edit to a broken file would find nothing and say something
 * misleading about a missing question, when the real problem is the file. It also means the
 * form can never be the thing that breaks a study: it starts from a valid one every time.
 */
function readable(text: string): EditResult | null {
  return parseStudy(text).ok ? null : unreadable;
}

const INDENT = (line: string) => line.length - line.trimStart().length;

const unreadable: EditResult = {
  ok: false,
  problem: "This file could not be read, so the form cannot change it. Fix it in the text view first.",
};

type Block = { start: number; end: number; indent: number };

/** The lines of a top-level section, from its key to the next top-level key. */
function section(lines: string[], key: string): Block | null {
  const start = lines.findIndex((l) => l.startsWith(`${key}:`));
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    if (INDENT(line) === 0) {
      end = i;
      break;
    }
  }
  return { start, end, indent: 0 };
}

/** One item of a list, from its `- ` marker to the line before the next marker. */
function listItems(lines: string[], within: Block): Block[] {
  const items: Block[] = [];
  let markerIndent = -1;

  for (let i = within.start + 1; i < within.end; i += 1) {
    const line = lines[i]!;
    const trimmed = line.trimStart();
    if (!trimmed.startsWith("- ")) continue;
    const indent = INDENT(line);
    if (markerIndent === -1) markerIndent = indent;
    if (indent !== markerIndent) continue;

    if (items.length > 0) items[items.length - 1]!.end = i;
    items.push({ start: i, end: within.end, indent });
  }

  // Trailing blank lines and comments belong to whatever comes next, not to this item.
  for (const item of items) {
    let end = item.end;
    while (end > item.start + 1) {
      const line = lines[end - 1]!;
      if (line.trim() === "" || line.trimStart().startsWith("#")) end -= 1;
      else break;
    }
    item.end = end;
  }
  return items;
}

/** Read a simple `key: value` from inside a block, ignoring anything nested deeper. */
function readField(lines: string[], block: Block, field: string): { line: number; value: string } | null {
  const want = INDENT(lines[block.start]!) + 2;
  for (let i = block.start; i < block.end; i += 1) {
    const line = lines[i]!;
    const trimmed = line.trimStart();
    const bare = trimmed.startsWith("- ") ? trimmed.slice(2) : trimmed;
    const indent = trimmed.startsWith("- ") ? INDENT(line) + 2 : INDENT(line);
    if (indent !== want && i !== block.start) continue;
    if (bare.startsWith(`${field}:`)) {
      return { line: i, value: bare.slice(field.length + 1).trim() };
    }
  }
  return null;
}

/** Where a field's value ends: its own line, plus any more-indented continuation lines. */
function fieldExtent(lines: string[], block: Block, line: number): number {
  const base = INDENT(lines[line]!);
  let end = line + 1;
  while (end < block.end) {
    const next = lines[end]!;
    if (next.trim() === "") {
      // A blank line inside a block scalar still belongs to it.
      const after = lines[end + 1];
      if (after && INDENT(after) > base) {
        end += 1;
        continue;
      }
      break;
    }
    if (INDENT(next) > base) end += 1;
    else break;
  }
  return end;
}

/** Render a value at a given indent: inline when it is short and plain, a block when it is not. */
function render(key: string, value: string, indent: number, listMarker = false): string[] {
  const pad = " ".repeat(indent);
  const head = listMarker ? `${" ".repeat(Math.max(0, indent - 2))}- ${key}:` : `${pad}${key}:`;

  if (value.includes("\n")) {
    const body = value.replace(/\n+$/, "").split("\n");
    return [`${head} |`, ...body.map((l) => `${pad}  ${l}`.trimEnd())];
  }
  if (value.length + head.length > 96) {
    return [`${head} >-`, ...wrap(value, 92 - indent).map((l) => `${pad}  ${l}`)];
  }
  return [`${head} ${quoted(value)}`];
}

function wrap(value: string, width: number): string[] {
  const words = value.split(/\s+/);
  const out: string[] = [];
  let line = "";
  for (const word of words) {
    if (line && line.length + word.length + 1 > width) {
      out.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) out.push(line);
  return out;
}

/** Quote only when YAML would otherwise read the value as something other than a string. */
function quoted(value: string): string {
  const needs =
    /^[\s]|[\s]$|^[-?:,[\]{}#&*!|>'"%@`]|: |#|^(true|false|null|yes|no|on|off|~)$/i.test(value) ||
    (value !== "" && String(Number(value)) === value);
  return needs ? `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : value;
}

function splice(lines: string[], from: number, to: number, replacement: string[]): string {
  return [...lines.slice(0, from), ...replacement, ...lines.slice(to)].join("\n");
}

// ---------------------------------------------------------------- questions

function questionBlocks(lines: string[]): { block: Block; id: string }[] {
  const questions = section(lines, "questions");
  if (!questions) return [];
  return listItems(lines, questions).map((block) => ({
    block,
    id: readField(lines, block, "id")?.value ?? "",
  }));
}

export function setQuestionField(text: string, id: string, field: "text" | "hint", value: string): EditResult {
  const unparsed = readable(text);
  if (unparsed) return unparsed;

  const lines = text.split("\n");
  const found = questionBlocks(lines).find((q) => q.id === id);
  if (!found) return { ok: false, problem: `There is no question called "${id}" in this file.` };

  const trimmed = value.trim();
  if (field === "text" && trimmed.length === 0) {
    return { ok: false, problem: "A question needs something to ask." };
  }

  const existing = readField(lines, found.block, field);
  const indent = INDENT(lines[found.block.start]!) + 2;

  if (existing) {
    const end = fieldExtent(lines, found.block, existing.line);
    if (trimmed.length === 0) return { ok: true, text: splice(lines, existing.line, end, []) };
    return { ok: true, text: splice(lines, existing.line, end, render(field, trimmed, indent)) };
  }

  if (trimmed.length === 0) return { ok: true, text };

  const anchor = readField(lines, found.block, "id");
  if (!anchor) return unreadable;
  return { ok: true, text: splice(lines, anchor.line + 1, anchor.line + 1, render(field, trimmed, indent)) };
}

export function setOptionLabel(text: string, questionId: string, optionValue: string, label: string): EditResult {
  const unparsed = readable(text);
  if (unparsed) return unparsed;

  const lines = text.split("\n");
  const found = questionBlocks(lines).find((q) => q.id === questionId);
  if (!found) return { ok: false, problem: `There is no question called "${questionId}" in this file.` };
  if (label.trim().length === 0) return { ok: false, problem: "An option needs a label." };

  // Options are written inline, one per line: {value: x, label: y}
  for (let i = found.block.start; i < found.block.end; i += 1) {
    const line = lines[i]!;
    const match = /^(\s*-\s*\{\s*value:\s*)([^,}]+?)(\s*,\s*label:\s*)(.*?)(\s*\})\s*$/.exec(line);
    if (!match) continue;
    if (match[2]!.trim().replace(/^["']|["']$/g, "") !== optionValue) continue;

    const width = match[4]!.length;
    const next = quoted(label.trim());
    // Keep the column the labels line up in, when the new label still fits.
    const padded = next.length < width ? next.padEnd(width) : next;
    return { ok: true, text: splice(lines, i, i + 1, [`${match[1]}${match[2]}${match[3]}${padded}${match[5]}`]) };
  }
  return { ok: false, problem: `"${questionId}" has no option with the value ${optionValue}, or its options are not written one per line.` };
}

export function moveQuestion(text: string, id: string, direction: "up" | "down"): EditResult {
  const unparsed = readable(text);
  if (unparsed) return unparsed;

  const lines = text.split("\n");
  const blocks = questionBlocks(lines);
  const index = blocks.findIndex((q) => q.id === id);
  if (index === -1) return { ok: false, problem: `There is no question called "${id}" in this file.` };

  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= blocks.length) {
    return { ok: false, problem: `"${id}" is already ${direction === "up" ? "first" : "last"}.` };
  }

  const order = blocks.map((q) => q.id);
  [order[index], order[target]] = [order[target]!, order[index]!];

  const broken = firstForwardReference(lines, blocks, order);
  if (broken) {
    return {
      ok: false,
      problem: `That would put "${broken.question}" before "${broken.dependsOn}", which it depends on. A question can only ask about answers given earlier.`,
    };
  }

  const a = blocks[Math.min(index, target)]!.block;
  const b = blocks[Math.max(index, target)]!.block;
  const between = lines.slice(a.end, b.start);
  const rearranged = [...lines.slice(b.start, b.end), ...between, ...lines.slice(a.start, a.end)];
  return { ok: true, text: splice(lines, a.start, b.end, rearranged) };
}

/** A show_if can only look backwards, so reordering has to check what it would break. */
function firstForwardReference(
  lines: string[],
  blocks: { block: Block; id: string }[],
  order: string[],
): { question: string; dependsOn: string } | null {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const seen: string[] = [];
  for (const id of order) {
    const entry = byId.get(id);
    if (entry) {
      const showIf = readField(lines, entry.block, "show_if");
      if (showIf) {
        for (const name of (showIf.value.match(/[a-z][a-z0-9_]*/g) ?? [])) {
          if (byId.has(name) && name !== id && !seen.includes(name)) {
            return { question: id, dependsOn: name };
          }
        }
      }
    }
    seen.push(id);
  }
  return null;
}

export type ShowIfDraft = {
  questionId: string;
  test: "equals" | "not_equals" | "in" | "not_in" | "answered";
  values: string[];
};

export function setShowIf(text: string, id: string, draft: ShowIfDraft | null): EditResult {
  const unparsed = readable(text);
  if (unparsed) return unparsed;

  const lines = text.split("\n");
  const blocks = questionBlocks(lines);
  const found = blocks.find((q) => q.id === id);
  if (!found) return { ok: false, problem: `There is no question called "${id}" in this file.` };

  const existing = readField(lines, found.block, "show_if");

  if (!draft) {
    if (!existing) return { ok: true, text };
    return { ok: true, text: splice(lines, existing.line, fieldExtent(lines, found.block, existing.line), []) };
  }

  const order = blocks.map((q) => q.id);
  const here = order.indexOf(id);
  const there = order.indexOf(draft.questionId);
  if (there !== -1 && there >= here) {
    return {
      ok: false,
      problem: `"${id}" cannot depend on "${draft.questionId}", which is asked later. Move it earlier first.`,
    };
  }
  if (draft.test !== "answered" && draft.values.length === 0) {
    return { ok: false, problem: "Pick at least one answer for this condition." };
  }

  const inner =
    draft.test === "answered"
      ? "{answered: true}"
      : draft.test === "equals" || draft.test === "not_equals"
        ? `{${draft.test}: ${literal(draft.values[0]!)}}`
        : `{${draft.test}: [${draft.values.map(literal).join(", ")}]}`;

  const indent = INDENT(lines[found.block.start]!) + 2;
  const line = `${" ".repeat(indent)}show_if: {${draft.questionId}: ${inner}}`;

  if (existing) {
    return { ok: true, text: splice(lines, existing.line, fieldExtent(lines, found.block, existing.line), [line]) };
  }
  const anchor = readField(lines, found.block, "type") ?? readField(lines, found.block, "id");
  if (!anchor) return unreadable;
  return { ok: true, text: splice(lines, anchor.line + 1, anchor.line + 1, [line]) };
}

/** Option values may be numbers in the file; a form only ever hands back strings. */
function literal(value: string): string {
  if (value === "true" || value === "false") return value;
  if (value.trim() !== "" && String(Number(value)) === value.trim()) return value.trim();
  return `"${value.replace(/"/g, '\\"')}"`;
}

// ---------------------------------------------------------------- the email sequence

function touchBlock(lines: string[], touch: number): Block | null {
  const sequence = section(lines, "sequence");
  if (!sequence) return null;
  for (const item of listItems(lines, sequence)) {
    if (Number(readField(lines, item, "touch")?.value) === touch) return item;
  }
  return null;
}

export function setTouchField(text: string, touch: number, field: "day" | "body", value: string): EditResult {
  const unparsed = readable(text);
  if (unparsed) return unparsed;

  const lines = text.split("\n");
  const block = touchBlock(lines, touch);
  if (!block) return { ok: false, problem: `There is no touch ${touch} in this file.` };

  const existing = readField(lines, block, field);
  if (!existing) return { ok: false, problem: `Touch ${touch} has no ${field} to change.` };

  const indent = INDENT(lines[block.start]!) + 2;
  const end = fieldExtent(lines, block, existing.line);

  if (field === "day") {
    const day = Number(value);
    if (!Number.isInteger(day) || day < 0) return { ok: false, problem: "A day is a whole number, zero or more." };
    return { ok: true, text: splice(lines, existing.line, end, [`${" ".repeat(indent)}day: ${day}`]) };
  }

  if (value.trim().length === 0) return { ok: false, problem: "An email needs a body." };
  return { ok: true, text: splice(lines, existing.line, end, render("body", value.replace(/\r\n/g, "\n"), indent)) };
}

export function setSubject(text: string, touch: number, index: number, subject: string): EditResult {
  const unparsed = readable(text);
  if (unparsed) return unparsed;

  const lines = text.split("\n");
  const block = touchBlock(lines, touch);
  if (!block) return { ok: false, problem: `There is no touch ${touch} in this file.` };
  if (subject.trim().length === 0) return { ok: false, problem: "A subject line needs some words." };

  const head = readField(lines, block, "subjects");
  if (!head) return { ok: false, problem: `Touch ${touch} has no subject lines.` };

  const end = fieldExtent(lines, block, head.line);
  const entries: number[] = [];
  for (let i = head.line + 1; i < end; i += 1) {
    if (lines[i]!.trimStart().startsWith("- ")) entries.push(i);
  }
  const at = entries[index];
  if (at === undefined) return { ok: false, problem: `Touch ${touch} has no subject line ${index + 1}.` };

  const indent = INDENT(lines[at]!);
  return { ok: true, text: splice(lines, at, at + 1, [`${" ".repeat(indent)}- ${quoted(subject.trim())}`]) };
}

// ---------------------------------------------------------------- the sample

export function setBandTarget(text: string, key: string, target: number): EditResult {
  const unparsed = readable(text);
  if (unparsed) return unparsed;

  if (!Number.isInteger(target) || target <= 0) {
    return { ok: false, problem: "A target is a whole number of completed responses, one or more." };
  }
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (!line.includes(`key: ${key}`) || !line.includes("target:")) continue;
    const replaced = line.replace(/target:\s*\d+/, `target: ${target}`);
    if (replaced === line) continue;
    return { ok: true, text: splice(lines, i, i + 1, [replaced]) };
  }
  return { ok: false, problem: `There is no band called "${key}" in this file.` };
}

export function setSampleField(
  text: string,
  field: "pilot_size" | "seed" | "contact_history_window_days",
  value: number,
): EditResult {
  const unparsed = readable(text);
  if (unparsed) return unparsed;

  if (!Number.isInteger(value) || value < 0) {
    return { ok: false, problem: "That has to be a whole number, zero or more." };
  }
  const lines = text.split("\n");
  const sample = section(lines, "sample");
  if (!sample) return { ok: false, problem: "This file has no sample section." };

  for (let i = sample.start + 1; i < sample.end; i += 1) {
    const line = lines[i]!;
    if (INDENT(line) !== 2 || !line.trimStart().startsWith(`${field}:`)) continue;
    const comment = line.includes("#") ? `  ${line.slice(line.indexOf("#"))}` : "";
    return { ok: true, text: splice(lines, i, i + 1, [`  ${field}: ${value}${comment}`]) };
  }
  return { ok: false, problem: `This file has no ${field} to change.` };
}

// ---------------------------------------------------------------- the brief

/** The lines of one top-level field, including a block scalar's continuation lines. */
function topLevelExtent(lines: string[], key: string): { start: number; end: number } | null {
  const start = lines.findIndex((l) => l.startsWith(`${key}:`));
  if (start === -1) return null;
  return { start, end: fieldExtent(lines, { start, end: lines.length, indent: 0 }, start) };
}

/**
 * Set a top-level string: the study's name, its slug, or its question. A missing question
 * is added under the name, so a template without one can still be given one.
 */
export function setTopLevel(text: string, key: "name" | "slug" | "question", value: string): EditResult {
  const unparsed = readable(text);
  if (unparsed) return unparsed;

  const clean = value.trim();
  if (key !== "question" && clean === "") return { ok: false, problem: `A study needs a ${key}.` };
  if (key === "slug" && !/^[a-z0-9-]+$/.test(clean)) {
    return { ok: false, problem: "A slug is lowercase letters, numbers and dashes only." };
  }
  const lines = text.split("\n");
  const found = topLevelExtent(lines, key);

  if (!found) {
    if (key !== "question") return { ok: false, problem: `This file has no ${key} to change.` };
    if (clean === "") return { ok: true, text };
    const name = topLevelExtent(lines, "name");
    if (!name) return { ok: false, problem: "This file has no name line to add the question after." };
    return { ok: true, text: splice(lines, name.end, name.end, render("question", clean, 0)) };
  }
  if (key === "question" && clean === "") return { ok: true, text: splice(lines, found.start, found.end, []) };
  return { ok: true, text: splice(lines, found.start, found.end, render(key, clean, 0)) };
}

/** Who is asking, as the respondent will read it, or the neutral display name. */
export function setBrandField(text: string, field: "display_name" | "sponsor_line", value: string): EditResult {
  const unparsed = readable(text);
  if (unparsed) return unparsed;
  if (value.trim() === "") return { ok: false, problem: "That line cannot be empty: respondents read it." };

  const lines = text.split("\n");
  const brand = section(lines, "brand");
  if (!brand) return { ok: false, problem: "This file has no brand section." };
  const at = readField(lines, brand, field);
  if (!at) return { ok: false, problem: `This file has no ${field} to change.` };
  const end = fieldExtent(lines, brand, at.line);
  return { ok: true, text: splice(lines, at.line, end, render(field, value.trim(), 2)) };
}

/**
 * One of the depth switches: the smart survey, the AI interview, or the panel invitation.
 * Turning the interview off also removes its stage, because the kernel refuses a file with a
 * stage nobody can reach. Turning it on needs a guide, which only the whole-file view can add.
 */
export function setFeature(text: string, flag: "ai_followup" | "ai_interview" | "panel" | "hand_raise" | "benchmark", on: boolean): EditResult {
  const unparsed = readable(text);
  if (unparsed) return unparsed;

  let lines = text.split("\n");
  if (flag === "ai_interview") {
    const stages = section(lines, "stages");
    const interview = stages
      ? listItems(lines, stages).find((item) => readField(lines, item, "type")?.value === "interview")
      : undefined;
    if (on && !interview) {
      return { ok: false, problem: "This study has no interview guide to turn on. Add an interview stage in the whole file first." };
    }
    if (!on && interview) lines = splice(lines, interview.start, interview.end, []).split("\n");
  }

  const features = section(lines, "features");
  if (!features) return { ok: false, problem: "This file has no features section." };
  for (let i = features.start + 1; i < features.end; i += 1) {
    const line = lines[i]!;
    if (!line.trimStart().startsWith(`${flag}:`)) continue;
    const comment = line.includes("#") ? `  ${line.slice(line.indexOf("#")).trimEnd()}` : "";
    const pad = " ".repeat(INDENT(line));
    return { ok: true, text: splice(lines, i, i + 1, [`${pad}${flag}: ${on}${comment}`]) };
  }
  return { ok: false, problem: `This file has no ${flag} switch.` };
}

/** Who the study asks, by role. The frame's roles line is rewritten in place. */
export function setFrameRoles(text: string, roles: string[]): EditResult {
  const unparsed = readable(text);
  if (unparsed) return unparsed;
  const clean = [...new Set(roles.map((r) => r.trim()).filter((r) => /^[a-z_]+$/.test(r)))];
  if (clean.length === 0) return { ok: false, problem: "Pick at least one list to ask." };

  const lines = text.split("\n");
  const sample = section(lines, "sample");
  if (!sample) return { ok: false, problem: "This file has no sample section." };
  for (let i = sample.start + 1; i < sample.end; i += 1) {
    const line = lines[i]!;
    if (!/^\s+roles:\s*\[/.test(line)) continue;
    const comment = line.includes("#") ? `  ${line.slice(line.indexOf("#")).trimEnd()}` : "";
    const pad = " ".repeat(INDENT(line));
    return { ok: true, text: splice(lines, i, i + 1, [`${pad}roles: [${clean.join(", ")}]${comment}`]) };
  }
  return { ok: false, problem: "This file has no roles line in its sample frame." };
}
