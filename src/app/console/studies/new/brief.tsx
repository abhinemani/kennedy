"use client";

import { useMemo, useState } from "react";
import { expectedCompletes, expectedInterviews, marginAt, sampleSize } from "@/core/plan";
import { createFromBrief } from "../actions";

export type ListChoice = { key: string; label: string; origin: string; total: number; reachable: number };
export type TemplateChoice = {
  dir: string;
  name: string;
  question: string;
  sponsorLine: string;
  roles: string[];
  features: { ai_followup: boolean; ai_interview: boolean; panel: boolean };
  targets: number[];
  interviewMax: number | null;
  questions: number;
  hasInterview: boolean;
};

const n = (x: number) => x.toLocaleString("en-US");

// The brief, as a sponsor would write it: the question, who to ask, how deep, and what that
// should yield. Every choice is written into the study file when the study is created.
export function Brief({ lists, templates }: { lists: ListChoice[]; templates: TemplateChoice[] }) {
  const [dir, setDir] = useState(templates[0]?.dir ?? "");
  const template = templates.find((t) => t.dir === dir) ?? templates[0];
  const [name, setName] = useState("");
  const [question, setQuestion] = useState(template?.question ?? "");
  const [sponsorLine, setSponsorLine] = useState(template?.sponsorLine ?? "");
  const [roles, setRoles] = useState<Set<string>>(new Set(template?.roles ?? []));
  const [smart, setSmart] = useState(template?.features.ai_followup ?? false);
  const [interview, setInterview] = useState(template?.features.ai_interview ?? false);
  const [panel, setPanel] = useState(template?.features.panel ?? true);

  const pick = (t: TemplateChoice) => {
    setDir(t.dir);
    setQuestion(t.question);
    setSponsorLine(t.sponsorLine);
    setRoles(new Set(t.roles));
    setSmart(t.features.ai_followup);
    setInterview(t.features.ai_interview);
    setPanel(t.features.panel);
  };
  const toggle = (key: string) =>
    setRoles((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const plan = useMemo(() => {
    const reach = lists.filter((l) => roles.has(l.key)).reduce((a, l) => a + l.reachable, 0);
    const sample = sampleSize(reach, template?.targets ?? []);
    const completes = expectedCompletes(sample);
    const interviews = interview ? expectedInterviews(completes, template?.interviewMax ?? null) : 0;
    return { reach, sample, completes, interviews, margin: marginAt(completes) };
  }, [lists, roles, template, interview]);

  const pa = lists.filter((l) => l.origin === "power_almanac");
  const others = lists.filter((l) => l.origin !== "power_almanac" && l.total > 0);

  return (
    <form action={createFromBrief}>
      <input type="hidden" name="template" value={dir} />
      {[...roles].map((r) => (
        <input key={r} type="hidden" name="roles" value={r} />
      ))}

      <div className="cols">
        <div>
          <div className="card">
            <div className="card-head">
              <div>
                <h3>What do you want to learn?</h3>
                <p>The question the study exists to answer, in one sentence. It goes at the top of the report.</p>
              </div>
            </div>
            <label className="field" htmlFor="brief-name" style={{ marginTop: 0 }}>
              Study name
            </label>
            <p className="hint field-hint">Short, and how it will appear in the console and the report.</p>
            <input id="brief-name" name="name" type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Permitting workload, spring 2027" />

            <label className="field" htmlFor="brief-question">
              The question
            </label>
            <p className="hint field-hint">What you would put on the first slide.</p>
            <textarea id="brief-question" name="question" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="How much staff time do records requests take, and what would it take for offices to trust software with some of it?" />

            <label className="field" htmlFor="brief-sponsor">
              Who is asking, as respondents will read it
            </label>
            <p className="hint field-hint">
              Say who you are and that this is research. Officials answer candidly when they know both.
            </p>
            <textarea id="brief-sponsor" name="sponsor_line" required value={sponsorLine} onChange={(e) => setSponsorLine(e.target.value)} />
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-head">
              <div>
                <h3>Who are you asking?</h3>
                <p>One list per role. Reachable means a working address that no study has used lately.</p>
              </div>
              <span className="pill">{n(plan.reach)} reachable</span>
            </div>
            <span className="label">Power Almanac lists</span>
            <div className="lists">
              {pa.map((l) => (
                <button
                  type="button"
                  key={l.key}
                  className={l.total === 0 ? "list empty" : "list"}
                  aria-pressed={roles.has(l.key)}
                  onClick={() => toggle(l.key)}
                  disabled={l.total === 0}
                >
                  <b>{l.label}</b>
                  <span>{l.total === 0 ? "none loaded" : `${n(l.reachable)} reachable of ${n(l.total)}`}</span>
                </button>
              ))}
            </div>
            {others.length > 0 ? (
              <>
                <span className="label" style={{ marginTop: 16 }}>
                  Lists from other sources
                </span>
                <div className="lists">
                  {others.map((l) => (
                    <button type="button" key={l.key} className="list" aria-pressed={roles.has(l.key)} onClick={() => toggle(l.key)}>
                      <b>{l.label}</b>
                      <span>{`${n(l.reachable)} reachable of ${n(l.total)}`}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : null}
            <p className="card-foot">
              Licensed to you only. These contacts are never shared with a sponsor or mixed into another
              client&rsquo;s study.
            </p>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-head">
              <div>
                <h3>How deep?</h3>
                <p>Each step down reaches fewer people and learns more from each. Everyone starts with the same closed questions, so the numbers stay comparable.</p>
              </div>
            </div>
            <div className="rungs">
              <div className="rung">
                <input type="checkbox" checked disabled aria-label="Survey, always on" />
                <div>
                  <b>Survey</b>
                  <p>About five minutes of closed questions. This is where the charts come from.</p>
                </div>
                <span className="yield">about {n(plan.completes)} answers</span>
              </div>
              <label className="rung">
                <input type="checkbox" name="ai_followup" checked={smart} onChange={(e) => setSmart(e.target.checked)} />
                <div>
                  <b>Smart survey</b>
                  <em>add-on</em>
                  <p>One AI follow-up question after each written answer, for a sharper &ldquo;why&rdquo;.</p>
                </div>
                <span className="yield">{smart ? "on" : "off"}</span>
              </label>
              <label className="rung">
                <input type="checkbox" name="ai_interview" checked={interview} disabled={!template?.hasInterview} onChange={(e) => setInterview(e.target.checked)} />
                <div>
                  <b>AI interview</b>
                  <em>add-on</em>
                  <p>
                    A ten-minute conversation from a researcher&rsquo;s guide, offered to the most interesting
                    respondents{template?.interviewMax ? `, up to ${template.interviewMax}` : ""}.
                    {template && !template.hasInterview ? " This template has no interview guide." : ""}
                  </p>
                </div>
                <span className="yield">{interview ? `about ${n(plan.interviews)} conversations` : "off"}</span>
              </label>
              <label className="rung">
                <input type="checkbox" name="panel" checked={panel} onChange={(e) => setPanel(e.target.checked)} />
                <div>
                  <b>Panel invitation</b>
                  <p>Ask respondents to keep receiving benchmarks. Only their own tick adds them.</p>
                </div>
                <span className="yield">{panel ? "on" : "off"}</span>
              </label>
            </div>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-head">
              <div>
                <h3>Start from</h3>
                <p>A template carries the questions, the emails, and the benchmark. You edit them after.</p>
              </div>
            </div>
            <div className="rungs">
              {templates.map((t) => (
                <label className="rung" key={t.dir}>
                  <input type="radio" name="template_choice" checked={dir === t.dir} onChange={() => pick(t)} />
                  <div>
                    <b>{t.name}</b>
                    <p>
                      {t.questions} questions{t.hasInterview ? ", with an interview guide" : ""}.
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="card quiet" style={{ marginTop: 16 }}>
            <div className="card-head">
              <div>
                <h3>What this should yield</h3>
                <p>Rules of thumb, stated plainly. The real numbers replace them as answers come in.</p>
              </div>
            </div>
            <dl className="kv">
              <dt>People reachable</dt>
              <dd>{n(plan.reach)}</dd>
              <dt>Sample drawn</dt>
              <dd>
                {n(plan.sample)}
                <span className="state">the template&rsquo;s size bands cap the draw</span>
              </dd>
              <dt>Completed surveys</dt>
              <dd>about {n(plan.completes)}</dd>
              {interview ? (
                <>
                  <dt>Interviews</dt>
                  <dd>about {n(plan.interviews)}</dd>
                </>
              ) : null}
              <dt>Margin of error</dt>
              <dd>{plan.margin === null ? "—" : `about ±${plan.margin} points on a share`}</dd>
            </dl>
          </div>
        </div>
      </div>

      <div className="tally">
        <div className="figs">
          <div>
            <b>{n(plan.reach)}</b>
            <span>people you can reach</span>
          </div>
          <div>
            <b>{n(plan.completes)}</b>
            <span>answers to expect</span>
          </div>
          <div>
            <b>{plan.margin === null ? "—" : `±${plan.margin}`}</b>
            <span>points of margin</span>
          </div>
        </div>
        <button className="btn" type="submit" disabled={!name.trim() || roles.size === 0 || !dir}>
          Create the study
        </button>
      </div>
    </form>
  );
}
