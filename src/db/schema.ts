import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const stamps = { createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow() };

export const entityType = pgEnum("entity_type", ["city", "county", "township", "special_district", "school_district", "state_agency"]);
// Keep in step with ROLES in src/core/lists.ts. The first thirteen are Power Almanac's lists.
export const role = pgEnum("role", ["clerk", "manager", "mayor", "council", "it", "finance", "purchasing", "public_works", "police", "fire", "buildings", "communications", "hr", "records_officer", "attorney", "police_records", "other"]);
export const emailStatus = pgEnum("email_status", ["unverified", "valid", "risky", "invalid"]);
export const engine = pgEnum("engine", ["native", "surveymonkey"]);
export const studyStatus = pgEnum("study_status", ["draft", "pilot", "fielding", "closed"]);
export const tokenStatus = pgEnum("token_status", ["active", "completed", "expired"]);
export const messageStatus = pgEnum("message_status", ["queued", "sent", "delivered", "bounced", "complained", "failed"]);
export const responseStatus = pgEnum("response_status", ["partial", "complete"]);
export const reviewStatus = pgEnum("review_status", ["pending", "included", "excluded"]);

export const entities = pgTable("entities", {
  id: id(), geoid: text("geoid").unique(), name: text("name").notNull(), state: text("state").notNull(),
  type: entityType("type").notNull(), population: integer("population"), annualBudget: integer("annual_budget"),
  // The county a government sits in. Over a thousand township names repeat inside a single
  // state, and this is the only thing that tells them apart.
  county: text("county"),
  emailDomain: text("email_domain"), source: text("source"), ...stamps,
}, (t) => ({ byState: index("entities_state_idx").on(t.state, t.type) }));

export const contacts = pgTable("contacts", {
  id: id(), entityId: uuid("entity_id").references(() => entities.id), fullName: text("full_name"), title: text("title"),
  role: role("role").notNull().default("other"), email: text("email").notNull(), phone: text("phone"),
  source: text("source").notNull(), sourceRef: text("source_ref"),
  licenseScope: text("license_scope").notNull().default("owner_only"),
  emailStatus: emailStatus("email_status").notNull().default("unverified"), ...stamps,
}, (t) => ({ email: uniqueIndex("contacts_email_idx").on(t.email) })); // store emails lowercased

export const contactLists = pgTable("contact_lists", { // one row per imported file or source; shown on the audience screen
  id: id(), name: text("name").notNull(), source: text("source").notNull(), licenseScope: text("license_scope").notNull().default("owner_only"),
  rowCount: integer("row_count").notNull().default(0), notes: text("notes"), ...stamps,
});
export const contactListMembers = pgTable("contact_list_members", {
  id: id(), listId: uuid("list_id").notNull().references(() => contactLists.id), contactId: uuid("contact_id").notNull().references(() => contacts.id), ...stamps,
}, (t) => ({ uniq: uniqueIndex("contact_list_members_uniq").on(t.listId, t.contactId) }));

export const importRows = pgTable("import_rows", { // rows that did not resolve to an entity wait here
  id: id(), batch: text("batch").notNull(), raw: jsonb("raw").notNull(), problem: text("problem").notNull(),
  resolvedEntityId: uuid("resolved_entity_id").references(() => entities.id), ...stamps,
});

export const mappingProfiles = pgTable("mapping_profiles", { id: id(), name: text("name").notNull().unique(), columns: jsonb("columns").notNull(), ...stamps });

export const suppressions = pgTable("suppressions", {
  id: id(), email: text("email").notNull(), scope: text("scope").notNull().default("global"),
  studyId: uuid("study_id"), reason: text("reason").notNull(), ...stamps,
}, (t) => ({ byEmail: index("suppressions_email_idx").on(t.email) }));

export const studies = pgTable("studies", {
  id: id(), slug: text("slug").notNull().unique(), name: text("name").notNull(), engine: engine("engine").notNull(),
  features: jsonb("features").notNull(), status: studyStatus("status").notNull().default("draft"),
  draftText: text("draft_text").notNull(), // the editable study file; edited in the console
  sendingPausedReason: text("sending_paused_reason"), ...stamps,
});

export const studyVersions = pgTable("study_versions", { // immutable once written
  id: id(), studyId: uuid("study_id").notNull().references(() => studies.id), version: integer("version").notNull(),
  sourceText: text("source_text").notNull(), content: jsonb("content").notNull(), contentHash: text("content_hash").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ uniq: uniqueIndex("study_versions_uniq").on(t.studyId, t.version) }));

export const studyContacts = pgTable("study_contacts", {
  id: id(), studyId: uuid("study_id").notNull().references(() => studies.id), contactId: uuid("contact_id").notNull().references(() => contacts.id),
  stratumKey: text("stratum_key").notNull(), token: text("token").notNull().unique(), tokenStatus: tokenStatus("token_status").notNull().default("active"),
  isPilot: boolean("is_pilot").notNull().default(false), skippedReason: text("skipped_reason"),
  attributes: jsonb("attributes").notNull(), // snapshot of role, state, population, band at draw time
  ...stamps,
}, (t) => ({ uniq: uniqueIndex("study_contacts_uniq").on(t.studyId, t.contactId) }));

export const messages = pgTable("messages", {
  id: id(), studyContactId: uuid("study_contact_id").notNull().references(() => studyContacts.id), touch: integer("touch").notNull(),
  subjectVariant: integer("subject_variant").notNull().default(0), provider: text("provider").notNull(), providerMessageId: text("provider_message_id"),
  status: messageStatus("status").notNull().default("queued"), sentAt: timestamp("sent_at", { withTimezone: true }), ...stamps,
}, (t) => ({
  uniq: uniqueIndex("messages_uniq").on(t.studyContactId, t.touch),
  // A delivery report finds its message by this id, so two messages must never share one.
  byProviderId: uniqueIndex("messages_provider_message_id_uniq").on(t.providerMessageId),
}));

export const linkEvents = pgTable("link_events", { // "loaded" is never counted as opened
  id: id(), studyContactId: uuid("study_contact_id").notNull().references(() => studyContacts.id),
  type: text("type").notNull(), userAgent: text("user_agent"), ipHash: text("ip_hash"), ...stamps,
});

export const responses = pgTable("responses", {
  id: id(), studyContactId: uuid("study_contact_id").notNull().references(() => studyContacts.id),
  studyVersionId: uuid("study_version_id").notNull().references(() => studyVersions.id), engine: engine("engine").notNull(),
  status: responseStatus("status").notNull().default("partial"), startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }), durationSeconds: integer("duration_seconds"),
  qualityFlags: jsonb("quality_flags").notNull().default([]), reviewStatus: reviewStatus("review_status").notNull().default("pending"),
  stageId: text("stage_id").notNull().default("survey"), exclusionReason: text("exclusion_reason"), quotePermission: boolean("quote_permission").notNull().default(false), externalId: text("external_id"), ...stamps,
});

export const answers = pgTable("answers", {
  id: id(), responseId: uuid("response_id").notNull().references(() => responses.id), questionId: text("question_id").notNull(),
  value: jsonb("value"), answeredAt: timestamp("answered_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ uniq: uniqueIndex("answers_uniq").on(t.responseId, t.questionId) }));

export const freeText = pgTable("free_text", { // no names, emails, or entity names here
  id: id(), responseId: uuid("response_id").notNull().references(() => responses.id), questionId: text("question_id").notNull(), text: text("text").notNull(), ...stamps,
});

export const followups = pgTable("followups", {
  id: id(), responseId: uuid("response_id").notNull().references(() => responses.id), sourceQuestionId: text("source_question_id").notNull(),
  generatedQuestion: text("generated_question").notNull(), answerText: text("answer_text"), model: text("model"), fallbackUsed: boolean("fallback_used").notNull().default(false), ...stamps,
});

export const interviews = pgTable("interviews", {
  id: id(), responseId: uuid("response_id").notNull().references(() => responses.id), stageId: text("stage_id").notNull(),
  status: text("status").notNull().default("invited"), // invited, started, completed, abandoned
  startedAt: timestamp("started_at", { withTimezone: true }), completedAt: timestamp("completed_at", { withTimezone: true }), model: text("model"), ...stamps,
});
export const interviewTurns = pgTable("interview_turns", { // transcripts are free text: no names, emails, or entity names
  id: id(), interviewId: uuid("interview_id").notNull().references(() => interviews.id), n: integer("n").notNull(),
  speaker: text("speaker").notNull(), text: text("text").notNull(), topicId: text("topic_id"), scripted: boolean("scripted").notNull().default(false), ...stamps,
}, (t) => ({ uniq: uniqueIndex("interview_turns_uniq").on(t.interviewId, t.n) }));

export const panelMembers = pgTable("panel_members", { // officials who chose to keep hearing from us; never a purchased list
  id: id(), contactId: uuid("contact_id").notNull().references(() => contacts.id).unique(), joinedViaStudyId: uuid("joined_via_study_id").references(() => studies.id),
  status: text("status").notNull().default("active"), preferences: jsonb("preferences").notNull().default({}), ...stamps,
});

export const handRaises = pgTable("hand_raises", {
  id: id(), responseId: uuid("response_id").notNull().references(() => responses.id), type: text("type").notNull(), email: text("email").notNull(),
  domainMatch: boolean("domain_match").notNull().default(false), verifiedAt: timestamp("verified_at", { withTimezone: true }), ...stamps,
});

export const codebookThemes = pgTable("codebook_themes", { id: id(), studyId: uuid("study_id").notNull().references(() => studies.id), code: text("code").notNull(), label: text("label").notNull(), definition: text("definition"), ...stamps });
export const textCodes = pgTable("text_codes", {
  id: id(), freeTextId: uuid("free_text_id").notNull().references(() => freeText.id), themeId: uuid("theme_id").notNull().references(() => codebookThemes.id),
  coder: text("coder").notNull(), confidence: integer("confidence"), isSecondPass: boolean("is_second_pass").notNull().default(false), ...stamps,
});

export const benchmarkSeeds = pgTable("benchmark_seeds", { id: id(), studyId: uuid("study_id").notNull().references(() => studies.id), metric: text("metric").notNull(), stratumKey: text("stratum_key").notNull(), values: jsonb("values").notNull(), sourceNote: text("source_note"), ...stamps });

export const settings = pgTable("settings", { key: text("key").primaryKey(), value: jsonb("value").notNull(), ...stamps }); // edited in the console, never secrets
export const activityLog = pgTable("activity_log", { id: id(), action: text("action").notNull(), detail: jsonb("detail"), ...stamps }); // what the operator did, and when
