"use client";

import Image from "next/image";
import mark from "@/assets/aqualink-mark.png";
import { cls } from "@/lib/format";

const BUBBLES = [
  { left: "12%", size: 6, delay: 0, dur: 7 },
  { left: "24%", size: 10, delay: 2.4, dur: 9 },
  { left: "38%", size: 5, delay: 1.1, dur: 6.5 },
  { left: "55%", size: 8, delay: 3.2, dur: 8 },
  { left: "68%", size: 4, delay: 0.6, dur: 6 },
  { left: "79%", size: 9, delay: 1.8, dur: 8.5 },
  { left: "90%", size: 6, delay: 4, dur: 7.5 },
];

/**
 * Underwater loading screen shown while the 3D engine downloads and its shaders
 * compile. The same component covers both phases so nothing jumps between them.
 */
export function SceneLoader({ step, done = false }: { step: string; done?: boolean }) {
  return (
    <div
      aria-hidden={done}
      className={cls("loader-water pointer-events-none absolute inset-0 z-10 grid place-items-center overflow-hidden transition-opacity duration-700 ease-out", done ? "opacity-0" : "opacity-100")}
    >
      <div aria-hidden className="loader-rays absolute inset-0" />
      {BUBBLES.map((b) => (
        <span
          key={b.left}
          aria-hidden
          className="loader-bubble absolute bottom-[-12px] rounded-full"
          style={{ left: b.left, width: b.size, height: b.size, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s` }}
        />
      ))}
      <div role="status" className="glass-dark relative flex w-[300px] flex-col items-center gap-3 rounded-2xl px-6 py-5 text-white">
        <span className="relative grid h-16 w-24 place-items-center">
          <span aria-hidden className="absolute inset-2 rounded-full bg-sky-300/25 blur-xl" />
          <Image src={mark} alt="" priority className="loader-logo relative h-14 w-auto drop-shadow-[0_0_14px_rgba(125,211,252,0.55)]" />
        </span>
        <div className="text-center">
          <p className="text-[14px] font-semibold tracking-tight">Building the facility twin</p>
          <p className="mt-0.5 text-[12px] text-sky-100/70">{step}</p>
        </div>
        <span className="relative h-1 w-full overflow-hidden rounded-full bg-white/10">
          <span className="loader-bar absolute inset-y-0 left-0 w-2/5 rounded-full bg-gradient-to-r from-transparent via-sky-300 to-transparent" />
        </span>
      </div>
    </div>
  );
}
