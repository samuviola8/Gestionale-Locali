"use client";

import { useEffect, useState } from "react";

function Sun() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function Moon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8z" />
    </svg>
  );
}

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // localStorage non disponibile: pazienza
    }
  }

  return (
    <button
      onClick={toggle}
      role="switch"
      aria-checked={dark}
      aria-label="Modalità chiara o scura"
      className="relative inline-flex h-7 w-[54px] shrink-0 items-center rounded-full border bd"
      style={{ background: "var(--surface-2)" }}
    >
      <span
        aria-hidden="true"
        className="absolute left-[7px]"
        style={{ color: "#f59e0b", opacity: 0.35 }}
      >
        <Sun />
      </span>
      <span
        aria-hidden="true"
        className="absolute right-[7px]"
        style={{ color: "#7dd3fc", opacity: 0.35 }}
      >
        <Moon />
      </span>
      <span
        className="absolute flex h-[22px] w-[22px] items-center justify-center rounded-full shadow transition-transform"
        style={{
          background: "var(--surface)",
          color: dark ? "#7dd3fc" : "#f59e0b",
          transform: dark ? "translateX(29px)" : "translateX(3px)",
        }}
      >
        {dark ? <Moon /> : <Sun />}
      </span>
    </button>
  );
}
