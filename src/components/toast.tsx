"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SHOWN_MS = 1600;

/** A small message that confirms what a tap did, as on the Montreal board. It is a live region so a screen reader says it too. */
export function useToast() {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const show = useCallback((text: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(text);
    timer.current = setTimeout(() => setMessage(""), SHOWN_MS);
  }, []);

  const toast = (
    <div className="toast" role="status" aria-live="polite" data-on={message ? "true" : "false"}>
      {message}
    </div>
  );
  return { toast, show };
}
