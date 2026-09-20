"use client";

import { useState } from "react";

/** The one interactive control that needs to show a value while it moves. */
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
  initial: number;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <output className="big" htmlFor="slider">
        {value}
        {unit}
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
        onChange={(e) => setValue(Number(e.target.value))}
      />
    </>
  );
}
