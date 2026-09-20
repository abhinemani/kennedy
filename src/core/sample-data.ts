// Sample data: a complete, obviously fake dataset for every table, so the operator can see
// every console screen populated before a single real contact is loaded.
//
// Everything here is deterministic from one seed, so the same study file always produces the
// same fake records. Nothing here is real: every government name ends in "(sample)", every
// email address ends in ".sample.example" (a domain reserved by the IETF that cannot receive
// mail), and every person's surname is a word that says so. The console removes all of it by
// those same marks, so loading it on a live deployment is reversible.

import { drawSample, seededRandom, shuffle } from "./draw";
import { nextQuestion, UNKNOWN, type Answers } from "./flow";
import { bandOf, type Band, type RoleKey } from "./lists";
import { qualityFlags, type Flag } from "./quality";
import { doubleCodedSample, type Theme } from "./coding";
import type { Question, Study } from "./study-schema";

/** The mark on every entity, contact and list this module creates. */
export const SAMPLE_SOURCE = "sample_data";
export const SAMPLE_STUDY_SLUG = "sample-records-study";
export const SAMPLE_STUDY_NAME = "Sample study (fake data)";
/** Every sample email address ends with this. RFC 2606 reserves .example, so none can be delivered. */
export const SAMPLE_EMAIL_SUFFIX = ".sample.example";
export const SAMPLE_IMPORT_BATCH = "sample_data";
export const SAMPLE_PROFILE_NAME = "Sample supplier file";
export const SAMPLE_NAME_SUFFIX = " (sample)";

/** Filled into any setting that is still blank, and cleared again on removal. */
export const SAMPLE_SETTINGS = {
  linkDomain: "https://surveys.sample.example",
  postalAddress: "100 Sample Street, Sampleton, ZZ 00000",
  replyTo: `research@kennedy${SAMPLE_EMAIL_SUFFIX}`,
};

/**
 * The sample study is the worked example with its placeholders filled in and its name changed,
 * so sending is not blocked and it can never be mistaken for the real one.
 */
export function sampleStudyText(templateText: string): string {
  return templateText
    .replace(/^slug: .*$/m, `slug: ${SAMPLE_STUDY_SLUG}`)
    .replace(/^name: .*$/m, `name: ${SAMPLE_STUDY_NAME}`)
    .replace(/^(\s*contact_email:) CHANGE_ME$/m, `$1 ${SAMPLE_SETTINGS.replyTo}`)
    .replace(/^(\s*postal_address:) CHANGE_ME$/m, `$1 ${SAMPLE_SETTINGS.postalAddress}`)
    .replace(/^(\s*scheduling_url:) CHANGE_ME$/m, "$1 https://calendar.sample.example/book")
    .replace(/^(\s*pilot_size:) \d+$/m, "$1 6");
}

// ---------------------------------------------------------------- the shape of it

export type SampleEntity = {
  key: string; geoid: string; name: string; state: string; type: "city" | "county" | "township" | "special_district" | "school_district";
  population: number | null; annualBudget: number | null; county: string | null; emailDomain: string;
};

export type SampleContact = {
  key: string; entityKey: string; fullName: string; title: string; role: RoleKey; email: string; phone: string | null;
  licenseScope: string; emailStatus: "unverified" | "valid" | "risky" | "invalid";
};

export type SampleList = { name: string; licenseScope: string; memberKeys: string[] };

export type SampleMessage = {
  contactKey: string; touch: number; subjectVariant: number; providerMessageId: string;
  status: "sent" | "delivered" | "bounced" | "complained" | "failed"; daysAgo: number;
};

export type SampleTurn = { speaker: "interviewer" | "respondent"; text: string; topicId: string | null; scripted: boolean };

export type SampleResponse = {
  key: string;
  contactKey: string;
  status: "partial" | "complete";
  startedDaysAgo: number;
  durationSeconds: number;
  /** What the respondent answered, in study order. Free text is here as well as in `freeText`. */
  answers: Record<string, unknown>;
  /** Bookkeeping the survey keeps beside the answers, under keys that start with two underscores. */
  internal: Record<string, unknown>;
  freeText: { questionId: string; text: string }[];
  qualityFlags: Flag[];
  reviewStatus: "pending" | "included" | "excluded";
  exclusionReason: string | null;
  quotePermission: boolean;
  handRaises: { type: string; email: string; domainMatch: boolean }[];
  joinsPanel: boolean;
  followup: { sourceQuestionId: string; generatedQuestion: string; answerText: string | null; model: string | null; fallbackUsed: boolean } | null;
  interview: { status: "invited" | "started" | "completed" | "abandoned"; turns: SampleTurn[] } | null;
};

export type SampleCode = { responseKey: string; questionId: string; themeCode: string; coder: "ai" | "human"; confidence: number | null; isSecondPass: boolean };

export type SampleData = {
  entities: SampleEntity[];
  contacts: SampleContact[];
  lists: SampleList[];
  importRows: { raw: Record<string, string>; problem: string }[];
  mappingProfile: { name: string; columns: Record<string, string> };
  suppressions: { email: string; reason: "unsubscribed" | "bounced" | "complaint" | "manual" }[];
  drawn: { contactKey: string; stratumKey: string; isPilot: boolean; attributes: Record<string, string | number | null> }[];
  skipped: Record<string, number>;
  messages: SampleMessage[];
  linkEvents: { contactKey: string; type: "loaded" | "started"; daysAgo: number }[];
  responses: SampleResponse[];
  themes: Theme[];
  codes: SampleCode[];
  benchmarkSeeds: { metric: string; stratumKey: string; values: number[]; sourceNote: string }[];
};

// ---------------------------------------------------------------- the raw material

const PLACES = [
  "Alderbrook", "Birchwater", "Cedar Hollow", "Dunmore Falls", "Eastgate", "Fernridge", "Graniteville", "Harrow Point",
  "Ironbridge", "Juniper Flats", "Kestrel Bay", "Larkspur", "Millbrook", "Northfield Crossing", "Oakhaven", "Pinecrest",
  "Quarry Hill", "Redwater", "Saltmarsh", "Thornbury", "Upland Meadows", "Vale Springs", "Westbrook", "Yarrow Creek",
  "Ashford Landing", "Bellhaven", "Copperfield", "Driftwood", "Elm Station", "Foxglove", "Greyfield", "Hollowmere",
  "Ivyridge", "Jasper Bend", "Kingsford", "Lindenmoor", "Marlow Heights", "Nettlebrook", "Orchard Park", "Pebble Shore",
  "Rookwood", "Silverstone", "Timberline", "Umber Valley", "Violet Ridge", "Wexley", "Ashcombe", "Brightwater",
];

const STATES = ["CA", "OH", "TX", "MI", "WA", "CO", "NC", "IL", "PA", "MN", "GA", "AZ", "WI", "VA", "OR", "TN"];

const COUNTIES = ["Adams", "Baker", "Clay", "Douglas", "Elk", "Franklin", "Grant", "Hardin", "Iron", "Jackson", "Lake", "Marion"];

const FIRST_NAMES = [
  "Avery", "Blake", "Casey", "Dana", "Ellis", "Frankie", "Gray", "Harper", "Indigo", "Jordan", "Kai", "Lane",
  "Morgan", "Noel", "Oakley", "Parker", "Quinn", "Reese", "Sage", "Tatum", "Val", "Wren", "Emerson", "Finley",
];

/** Surnames that say what they are. Every sample person carries one. */
const SURNAMES = ["Sample", "Example", "Placeholder", "Fictional", "Notreal", "Testcase"];

const TITLES: Record<string, string[]> = {
  clerk: ["City Clerk", "Town Clerk", "County Clerk", "Deputy Clerk"],
  records_officer: ["Public Records Officer", "Records Coordinator", "Records Manager"],
  manager: ["City Manager", "County Administrator", "Town Administrator"],
  attorney: ["City Attorney", "County Counsel", "Assistant City Attorney"],
  it: ["IT Director", "Chief Information Officer", "Information Systems Manager"],
  finance: ["Finance Director", "Treasurer"],
  mayor: ["Mayor"],
  council: ["Council Member"],
  purchasing: ["Purchasing Manager"],
};

const STORIES = [
  "A request for three years of email from one department took eleven weeks. Most of that was redaction, page by page, because the export tool could not search inside attachments.",
  "Body camera footage from a traffic stop. Blurring faces in forty minutes of video took a full week of one person's time, and the requester appealed the fee.",
  "The same requester files a near-identical request every month. We rebuild the response from scratch each time because nothing links the new request to the old one.",
  "The deadline passed while the only person who knew the filing system was on leave. We paid a penalty and nobody had done anything wrong on purpose.",
  "A request for every text message on a personal phone. Legal review took longer than the search, and we still are not sure we got it right.",
  "Twelve boxes of building permits from the 1990s. They were scanned as images, so keyword search found nothing and someone read every page.",
  "A reporter asked for a spreadsheet we publish anyway, but the request came in through the portal so it went through the whole intake and review process.",
  "We released a document with a name that should have been withheld. It was caught later, and now every release gets a second read, which doubled the time.",
  "A contract file spread across three systems and two retired employees' inboxes. Finding it was the work; the release itself took an hour.",
  "The request was fine. The problem was that it arrived the same week as forty others from one advocacy campaign, and each needed its own response.",
  "Search terms were so broad the first pull was ninety thousand pages. Narrowing it took four rounds of letters with the requester.",
  "An old dispute between neighbours, refiled as records requests about each other's permits, every few weeks, for two years.",
];

const NEEDS = [
  "A clear log of every change the software made, and a way to compare its draft with the source before anything goes out.",
  "Proof it never sends anything on its own. A person clicks release, or nothing leaves.",
  "It has to show me what it redacted and why, in plain words, not just a black box on the page.",
  "Our attorney would need to sign off, and they would want to see how it handles the exemptions specific to this state.",
  "Time to test it on old requests where we already know the right answer.",
  "Knowing where the data goes. If it leaves our systems, the answer is no.",
];

const FOLLOWUP_QUESTIONS = [
  "Which step in that request took the longest, and who was waiting on it?",
  "What would have had to be different for that request to go well?",
  "When that happened, who else had to get involved before it could close?",
];

const FOLLOWUP_ANSWERS = [
  "Redaction, and the wait for legal to look at what we had redacted.",
  "Fewer hands. Every handoff added a week.",
  "A search that actually covered attachments. We found the last batch by accident.",
  null,
];

const INTERVIEW_ANSWERS: Record<string, string[]> = {
  hard_request: [
    "It came in on a Friday. Intake took a day, the search took two weeks because it spanned three departments, and then redaction. Redaction was most of it.",
    "The last hard one was video. We do not have a tool for it, so one person sat with the footage and blurred frame by frame.",
  ],
  time_sinks: [
    "Chasing colleagues. The search itself is quick once someone actually runs it, but getting people to run it is the job.",
    "Redaction and legal review, in that order. Intake is a form and takes minutes.",
  ],
  tried: [
    "We bought a portal. It made intake tidier and did nothing for the search or the redaction, which is where the time goes.",
    "A shared spreadsheet with a column per step. It helped until the person who kept it up left.",
  ],
  trust: [
    "I would read the whole draft against the source. I would want to see what it removed and be able to put something back with one click.",
    "The exemptions. If it cited the right one for each redaction I would trust it more than I trust myself at five on a Friday.",
  ],
  buying: [
    "Under ten thousand I can sign it. Over that it goes to the board, which meets monthly, and then procurement.",
    "Anything with software goes through IT first, then finance, then the manager. Three months if it goes well.",
  ],
};

// ---------------------------------------------------------------- helpers

type Rand = () => number;
const int = (r: Rand, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const pick = <T,>(r: Rand, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
const chance = (r: Rand, p: number) => r() < p;
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function bandsOf(study: Study): Band[] {
  return study.sample.strata.bands.map((b) => ({ key: b.key, label: b.label, max: b.max }));
}

/** Populations spread across every band the study names, so every stratum has someone in it. */
function populationFor(r: Rand, index: number, bands: Band[]): number {
  const band = bands[index % bands.length]!;
  const lower = index % bands.length === 0 ? 1000 : (bands[index % bands.length - 1]!.max ?? 0) + 1;
  const upper = band.max ?? Math.max(lower * 4, 900_000);
  return int(r, lower, upper);
}

// ---------------------------------------------------------------- the generator

export function buildSampleData(study: Study, seed = study.sample.seed): SampleData {
  const r = seededRandom(seed);
  const bands = bandsOf(study);

  // Governments. Most are the kinds the study asks; a couple are not, so the audience screen
  // has something to leave out.
  const entities: SampleEntity[] = PLACES.map((place, i) => {
    const type: SampleEntity["type"] =
      i >= PLACES.length - 2 ? (i % 2 ? "school_district" : "special_district")
        : i % 5 === 4 ? "county" : i % 5 === 3 ? "township" : "city";
    const name =
      type === "county" ? `${place} County${SAMPLE_NAME_SUFFIX}`
        : type === "township" ? `${place} Township${SAMPLE_NAME_SUFFIX}`
          : type === "school_district" ? `${place} School District${SAMPLE_NAME_SUFFIX}`
            : type === "special_district" ? `${place} Water District${SAMPLE_NAME_SUFFIX}`
              : `City of ${place}${SAMPLE_NAME_SUFFIX}`;
    // One township on purpose sits under the study's minimum population, to be left out.
    const population = i === 8 ? 640 : populationFor(r, i, bands);
    return {
      key: `entity-${i}`,
      geoid: `SAMPLE${String(i + 1).padStart(4, "0")}`,
      name,
      state: STATES[i % STATES.length]!,
      type,
      population,
      annualBudget: chance(r, 0.8) ? population * int(r, 900, 2600) : null,
      county: type === "county" ? null : `${pick(r, COUNTIES)} County`,
      emailDomain: `${slug(place)}${SAMPLE_EMAIL_SUFFIX}`,
    };
  });

  // People. Two to four per government, weighted towards the roles the study wants.
  const contacts: SampleContact[] = [];
  const usedEmails = new Set<string>();
  const roleMix: RoleKey[] = ["clerk", "clerk", "records_officer", "manager", "attorney", "it", "finance", "mayor", "council", "purchasing"];
  entities.forEach((e, ei) => {
    const howMany = e.type === "school_district" || e.type === "special_district" ? 1 : int(r, 2, 4);
    const roles = shuffle(roleMix, r).slice(0, howMany);
    if (ei < entities.length - 2 && !roles.includes("clerk") && !roles.includes("records_officer")) roles[0] = "clerk";
    for (const role of roles) {
      let email = "";
      let first = "";
      let last = "";
      do {
        first = pick(r, FIRST_NAMES);
        last = pick(r, SURNAMES);
        email = `${first}.${last}@${e.emailDomain}`.toLowerCase();
      } while (usedEmails.has(email));
      usedEmails.add(email);
      const n = contacts.length;
      contacts.push({
        key: `contact-${n}`,
        entityKey: e.key,
        fullName: `${first} ${last}`,
        title: pick(r, TITLES[role] ?? ["Staff"]),
        role,
        email,
        phone: chance(r, 0.6) ? `555-01${String(int(r, 0, 99)).padStart(2, "0")}` : null,
        // A few are licensed to someone else, so the draw has a trust-wall skip to show.
        licenseScope: n % 23 === 22 ? "sponsor_only" : n % 7 === 6 ? "client_ok" : "owner_only",
        emailStatus: n % 19 === 18 ? "invalid" : n % 13 === 12 ? "risky" : n % 3 === 0 ? "valid" : "unverified",
      });
    }
  });

  const byRole = (role: RoleKey) => contacts.filter((c) => c.role === role).map((c) => c.key);
  const lists: SampleList[] = [
    { name: "Sample clerks list", licenseScope: "owner_only", memberKeys: byRole("clerk") },
    { name: "Sample records officers list", licenseScope: "owner_only", memberKeys: byRole("records_officer") },
    { name: "Sample managers list", licenseScope: "client_ok", memberKeys: byRole("manager") },
    { name: "Sample attorneys and IT list", licenseScope: "owner_only", memberKeys: [...byRole("attorney"), ...byRole("it")] },
    { name: "Sample other officials list", licenseScope: "owner_only", memberKeys: [...byRole("finance"), ...byRole("mayor"), ...byRole("council"), ...byRole("purchasing")] },
  ].filter((l) => l.memberKeys.length > 0);

  const importRows = [
    {
      raw: { full_name: "Rowan Placeholder", title: "Clerk", role: "Clerk", email: `rowan.placeholder@nowhere${SAMPLE_EMAIL_SUFFIX}`, entity_name: "Springfield", state: "ZZ", entity_type: "city" },
      problem: "No government called Springfield in ZZ.",
    },
    {
      raw: { full_name: "Skyler Fictional", title: "Records Officer", role: "Records", email: `skyler.fictional@nowhere${SAMPLE_EMAIL_SUFFIX}`, entity_name: "Alderbrook", state: STATES[0]!, entity_type: "" },
      problem: "2 governments fit that name.",
    },
    {
      raw: { full_name: "Devon Example", title: "Administrator", role: "Top Appointed", email: "", entity_name: "Cedar Hollow", state: STATES[2]!, entity_type: "city" },
      problem: "No email address in this row.",
    },
  ];

  const mappingProfile = {
    name: SAMPLE_PROFILE_NAME,
    columns: { "Full Name": "full_name", "Job Title": "title", "Role": "role", "Email Address": "email", "Government": "entity_name", "State": "state", "Government Type": "entity_type" },
  };

  // Three people the study would otherwise ask, so the draw has suppressions to show.
  const askable = contacts.filter((c) => study.sample.frame.roles.includes(c.role) && c.licenseScope === "owner_only" && c.emailStatus !== "invalid");
  const suppressions: SampleData["suppressions"] = [
    { email: askable[1]!.email, reason: "unsubscribed" },
    { email: askable[5]!.email, reason: "bounced" },
    { email: askable[9]!.email, reason: "manual" },
  ];
  const suppressed = new Set(suppressions.map((s) => s.email));

  // The draw, through the kernel, so the sample screen's counts and skip reasons are the real ones.
  const entityOf = new Map(entities.map((e) => [e.key, e]));
  const frame = study.sample.frame;
  const candidates = contacts
    .map((c) => ({ c, e: entityOf.get(c.entityKey)! }))
    .filter(({ e }) => frame.entity_types.includes(e.type))
    .filter(({ e }) => frame.min_population === undefined || (e.population ?? 0) >= frame.min_population)
    .map(({ c, e }) => ({
      contactId: c.key,
      stratumKey: bandOf(e.population, bands) ?? "unbanded",
      role: c.role,
      suppressed: suppressed.has(c.email),
      emailStatus: c.emailStatus,
      licenseScope: c.licenseScope,
      lastContactedAt: null,
    }));
  const targets: Record<string, number> = {};
  for (const b of study.sample.strata.bands) targets[b.key] = b.target;
  const draw = drawSample({
    candidates,
    targets,
    eligibleRoles: [...frame.roles],
    primaryRoles: study.sample.primary_roles ? [...study.sample.primary_roles] : undefined,
    allowedLicenseScopes: ["owner_only", "client_ok"],
    historyWindowDays: study.sample.contact_history_window_days,
    pilotSize: study.sample.pilot_size,
    seed,
    now: new Date(0),
  });

  const contactOf = new Map(contacts.map((c) => [c.key, c]));
  const drawn = draw.picked.map((p) => {
    const c = contactOf.get(p.contactId)!;
    const e = entityOf.get(c.entityKey)!;
    return {
      contactKey: c.key,
      stratumKey: p.stratumKey,
      isPilot: p.isPilot,
      attributes: {
        role: c.role,
        state: e.state,
        entity_type: e.type,
        population: e.population,
        population_band: bandOf(e.population, bands),
        email_domain: e.emailDomain,
      },
    };
  });

  // Three touches, spaced the way the study's sequence spaces them, ending a few days ago.
  const touches = study.sequence.map((t) => t.touch);
  const firstDay = 14;
  const dayOf = (touch: number) => firstDay - (study.sequence.find((t) => t.touch === touch)?.day ?? 0);
  const messages: SampleMessage[] = [];
  const linkEvents: SampleData["linkEvents"] = [];
  const responses: SampleResponse[] = [];
  let messageN = 0;

  const seenEntity = new Set<string>();
  const durations: number[] = [];

  drawn.forEach((d, i) => {
    const c = contactOf.get(d.contactKey)!;
    const e = entityOf.get(c.entityKey)!;
    // The last few drawn have not been emailed yet, so touch 1 still has people due.
    if (i >= drawn.length - 6) return;

    const firstStatus: SampleMessage["status"] =
      c.emailStatus === "risky" && chance(r, 0.5) ? "bounced" : i % 29 === 28 ? "complained" : i % 31 === 30 ? "failed" : chance(r, 0.7) ? "delivered" : "sent";
    messages.push({
      contactKey: c.key, touch: touches[0] ?? 1, subjectVariant: i % 2,
      providerMessageId: `sample-${String(++messageN).padStart(4, "0")}`, status: firstStatus, daysAgo: dayOf(touches[0] ?? 1),
    });
    if (firstStatus === "bounced" || firstStatus === "complained" || firstStatus === "failed") return;

    const loaded = chance(r, 0.78);
    if (loaded) linkEvents.push({ contactKey: c.key, type: "loaded", daysAgo: dayOf(touches[0] ?? 1) - int(r, 0, 2) });

    const started = loaded && chance(r, 0.72);
    const completes = started && chance(r, 0.85);

    if (!completes && touches[1] !== undefined) {
      messages.push({
        contactKey: c.key, touch: touches[1], subjectVariant: 0,
        providerMessageId: `sample-${String(++messageN).padStart(4, "0")}`, status: chance(r, 0.8) ? "delivered" : "sent", daysAgo: dayOf(touches[1]),
      });
      if (!started && touches[2] !== undefined && chance(r, 0.6)) {
        messages.push({
          contactKey: c.key, touch: touches[2], subjectVariant: 0,
          providerMessageId: `sample-${String(++messageN).padStart(4, "0")}`, status: "delivered", daysAgo: dayOf(touches[2]),
        });
      }
    }

    if (!started) return;
    const startedDaysAgo = Math.max(1, dayOf(touches[0] ?? 1) - int(r, 0, 9));
    linkEvents.push({ contactKey: c.key, type: "started", daysAgo: startedDaysAgo });

    const responseKey = `response-${responses.length}`;
    const scope: Record<string, unknown> = { ...d.attributes, role_label: c.role.replace(/_/g, " ") };

    // Walk the study the way a person would, so branching is honoured and the spine is whole.
    const answers: Answers = {};
    const internal: Record<string, unknown> = {};
    const freeText: { questionId: string; text: string }[] = [];
    // Keyed to the response count rather than the draw, so each kind of flag always appears.
    const n = responses.length;
    const notInvolved = n % 9 === 8;
    const implausible = n % 11 === 10;
    const speeder = n % 7 === 6;
    const stopAfter = completes ? Infinity : int(r, 1, 4);
    let q: Question | null = nextQuestion(study, answers, scope, null);
    let asked = 0;
    while (q && asked < stopAfter) {
      const value = answerFor(q, r, e.population ?? 5000, { notInvolved, implausible });
      if (value !== undefined) {
        answers[q.id] = value;
        if ((q.type === "open" || q.type === "short_text") && typeof value === "string") freeText.push({ questionId: q.id, text: value });
        if (q.type === "number" && q.plausible && implausible && typeof value === "number") internal[`__confirmed_${q.id}`] = true;
      }
      asked += 1;
      q = nextQuestion(study, answers, scope, q.id);
    }

    const durationSeconds = speeder ? int(r, 25, 50) : int(r, 150, 720);
    const duplicate = seenEntity.has(e.key);
    if (completes) seenEntity.add(e.key);
    const median = durations.length ? [...durations].sort((a, b) => a - b)[Math.floor(durations.length / 2)]! : null;
    if (completes) durations.push(durationSeconds);

    const flags = completes
      ? qualityFlags({
          durationSeconds,
          medianDurationSeconds: median,
          speederSeconds: study.quality.speeder_seconds,
          confirmedImplausible: implausible,
          otherCompletesFromEntity: duplicate ? 1 : 0,
          involvement: answers.involvement,
          correctedIdentity: false,
        })
      : [];

    const excluded = completes && flags.includes("role_not_involved") && chance(r, 0.5);
    const reviewStatus: SampleResponse["reviewStatus"] = !completes ? "pending" : excluded ? "excluded" : flags.length && chance(r, 0.5) ? "included" : "pending";

    const raiseEmail = chance(r, 0.85) ? c.email : `${c.fullName.split(" ")[0]!.toLowerCase()}@personal-mail${SAMPLE_EMAIL_SUFFIX}`;
    const handRaises = completes && !notInvolved
      ? (study.hand_raises ?? [])
        .filter((h) => (h.default ? chance(r, 0.7) : chance(r, 0.3)))
        .map((h) => ({ type: h.id, email: raiseEmail, domainMatch: raiseEmail.endsWith(`@${e.emailDomain}`) }))
      : [];

    const storyQuestion = study.questions.find((x) => x.type === "open" && x.followup);
    const story = storyQuestion ? answers[storyQuestion.id] : undefined;
    const fallbackUsed = chance(r, 0.4);
    const followup = completes && storyQuestion && typeof story === "string"
      ? {
          sourceQuestionId: storyQuestion.id,
          generatedQuestion: fallbackUsed ? (storyQuestion.type === "open" ? storyQuestion.fallback ?? FOLLOWUP_QUESTIONS[1]! : FOLLOWUP_QUESTIONS[1]!) : pick(r, FOLLOWUP_QUESTIONS),
          answerText: pick(r, FOLLOWUP_ANSWERS),
          model: fallbackUsed ? null : "sample-data (no model was called)",
          fallbackUsed,
        }
      : null;

    responses.push({
      key: responseKey,
      contactKey: c.key,
      status: completes ? "complete" : "partial",
      startedDaysAgo,
      durationSeconds,
      answers,
      internal,
      freeText,
      qualityFlags: flags,
      reviewStatus,
      exclusionReason: excluded ? "Not involved in records work; answered about a different office." : null,
      quotePermission: completes && chance(r, 0.35),
      handRaises,
      joinsPanel: completes && !notInvolved && chance(r, 0.3),
      followup,
      interview: null,
    });
  });

  // Interviews for a handful of the people the study would invite: the ones with a story.
  const stage = study.stages.find((s) => s.type === "interview");
  if (stage && stage.type === "interview") {
    const eligible = responses.filter((x) => x.status === "complete" && x.freeText.length > 0 && x.reviewStatus !== "excluded");
    const statuses: NonNullable<SampleResponse["interview"]>["status"][] = ["completed", "completed", "completed", "started", "abandoned", "invited"];
    eligible.slice(0, statuses.length).forEach((x, n) => {
      const status = statuses[n]!;
      const turns: SampleTurn[] = [];
      if (status !== "invited") {
        const howMany = status === "completed" ? stage.guide.topics.length : status === "started" ? 2 : 1;
        stage.guide.topics.slice(0, howMany).forEach((topic, t) => {
          turns.push({ speaker: "interviewer", text: topic.ask, topicId: topic.id, scripted: t === 0 || chance(r, 0.3) });
          turns.push({ speaker: "respondent", text: pick(r, INTERVIEW_ANSWERS[topic.id] ?? ["It depends on the request, honestly."]), topicId: null, scripted: false });
        });
        if (status === "started") turns.push({ speaker: "interviewer", text: "Which of those steps would you change first, if you could?", topicId: stage.guide.topics[1]?.id ?? null, scripted: false });
      }
      x.interview = { status, turns };
    });
  }

  // The codebook from the study file, plus one the operator might add by hand.
  const themes: Theme[] = [...(study.codebook ?? []), { code: "waiting_on_legal", label: "Waiting on legal review", definition: "Time lost while an attorney reviews a release." }];
  const codeFor = (text: string): string => {
    const t = text.toLowerCase();
    const has = (code: string) => themes.some((th) => th.code === code);
    if (/video|footage|camera/.test(t) && has("video")) return "video";
    if (/email|inbox/.test(t) && has("email")) return "email";
    if (/same requester|refiled|every month/.test(t) && has("repeat")) return "repeat";
    if (/on leave|retired|left/.test(t) && has("turnover")) return "turnover";
    if (/penalty|appeal|legal|withheld/.test(t) && has("legal")) return "legal";
    if (/forty others|ninety thousand|boxes/.test(t) && has("volume")) return "volume";
    return has("other") ? "other" : themes[0]!.code;
  };

  const codes: SampleCode[] = [];
  const codable = responses.filter((x) => x.reviewStatus !== "excluded").flatMap((x) => x.freeText.map((f) => ({ x, f })));
  const doubled = new Set(doubleCodedSample(codable.map(({ x, f }) => `${x.key}:${f.questionId}`), 0.3, seed));
  codable.forEach(({ x, f }, n) => {
    if (n % 5 === 4) return; // some are still waiting to be coded
    const code = codeFor(f.text);
    const coder: SampleCode["coder"] = n % 3 === 0 ? "human" : "ai";
    codes.push({ responseKey: x.key, questionId: f.questionId, themeCode: code, coder, confidence: coder === "ai" ? int(r, 55, 98) : null, isSecondPass: false });
    if (doubled.has(`${x.key}:${f.questionId}`)) {
      const disagree = chance(r, 0.2);
      const other = themes.find((th) => th.code !== code)?.code ?? code;
      codes.push({ responseKey: x.key, questionId: f.questionId, themeCode: disagree ? other : code, coder: "human", confidence: null, isSecondPass: true });
    }
  });

  // Benchmark seeds: a dozen made-up peer values per metric per band.
  const benchmarkSeeds: SampleData["benchmarkSeeds"] = [];
  for (const m of study.benchmark?.metrics ?? []) {
    bands.forEach((b, bi) => {
      const scale = m.id.includes("per_1000") ? 1 : (bi + 1) * 400;
      const values = Array.from({ length: 12 }, () => Math.round((scale * (0.4 + r() * 1.6) + (m.id.includes("per_1000") ? 4 + r() * 20 : 0)) * 10) / 10);
      benchmarkSeeds.push({ metric: m.id, stratumKey: b.key, values, sourceNote: "Sample seed values. Made up; replace before the pilot." });
    });
  }

  return { entities, contacts, lists, importRows, mappingProfile, suppressions, drawn, skipped: draw.skipped, messages, linkEvents, responses, themes, codes, benchmarkSeeds };
}

/** One plausible answer for a question, of the type the survey would have stored. */
function answerFor(q: Question, r: Rand, population: number, ctx: { notInvolved: boolean; implausible: boolean }): unknown {
  switch (q.type) {
    case "choice": {
      if (q.id === "involvement") {
        if (ctx.notInvolved) return q.options.find((o) => o.value === "none")?.value ?? q.options[0]!.value;
        const active = q.options.filter((o) => o.value !== "none");
        return pick(r, active.length ? active : q.options).value;
      }
      if (q.id === "tool" && chance(r, 0.45)) return q.options.find((o) => o.value === "manual")?.value ?? pick(r, q.options).value;
      return pick(r, q.options).value;
    }
    case "multi":
      return shuffle(q.options, r).slice(0, int(r, 1, Math.min(3, q.options.length))).map((o) => o.value);
    case "number": {
      if (q.allow_unknown && chance(r, 0.08)) return UNKNOWN;
      const perThousand = ctx.implausible ? 400 : 2 + r() * 38;
      return Math.max(1, Math.round((population / 1000) * perThousand));
    }
    case "slider": {
      const steps = Math.floor((q.max - q.min) / q.step);
      return q.min + int(r, 0, steps) * q.step;
    }
    case "scale":
      return int(r, q.min, q.max);
    case "short_text":
      return chance(r, 0.5) ? pick(r, ["Deputy clerk", "The records coordinator in the attorney's office", "Our IT director handles the portal"]) : undefined;
    case "open":
      if (q.id === "ai_needs") return chance(r, 0.7) ? pick(r, NEEDS) : undefined;
      return chance(r, 0.75) ? pick(r, STORIES) : undefined;
    default:
      return undefined;
  }
}
