// A labelled form field.
//
// The hint sits outside the <label> and is tied to the control with aria-describedby. Nested
// inside the label it becomes part of the field's accessible name, so a screen reader reads
// "Full name Optional." as the name of the field, and two fields whose hints share a word
// become indistinguishable.

export function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <label className="field" htmlFor={id}>
        {label}
      </label>
      {hint ? (
        <p className="hint field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {children}
    </>
  );
}

/** Props every control inside a Field should spread, so the hint is announced as a description. */
export function describedBy(id: string, hint?: string) {
  return hint ? { "aria-describedby": `${id}-hint` } : {};
}
