"use client";

import { useState } from "react";

/**
 * The one interactive control that needs to show a value while it moves. Until the thumb is
 * moved there is no answer: the read-out says so, and the form carries no "touched" mark, so
 * the server records nothing rather than wherever the thumb happened to rest.
 */
export function Slider({
  min,
  max,
  step,
  unit,
  label,
  initial,
}: {
  min: number;
  max: number;
  step: number;
  unit: string;
  label: string;
  initial: number | null;
}) {
  const [value, setValue] = useState(initial ?? Math.round((min + max) / 2 / step) * step);
  const [touched, setTouched] = useState(initial !== null);
  return (
    <>
      <output className={touched ? "big" : "big unset"} htmlFor="slider" aria-live="polite">
        {touched ? `${value}${unit}` : "Slide to answer"}
      </output>
      <input
        id="slider"
        type="range"
        name="value"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        aria-valuetext={touched ? `${value}${unit}` : "not answered yet"}
        onChange={(e) => {
          setValue(Number(e.target.value));
          setTouched(true);
        }}
      />
      {touched ? <input type="hidden" name="touched" value="1" /> : null}
    </>
  );
}
