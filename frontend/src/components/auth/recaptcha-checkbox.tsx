"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

type GrecaptchaV2 = {
  ready(callback: () => void): void;
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      theme?: "light" | "dark";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    }
  ): number;
  reset(widgetId?: number): void;
};

declare global {
  interface Window {
    grecaptcha?: GrecaptchaV2;
  }
}

let scriptPromise: Promise<GrecaptchaV2> | null = null;

function loadRecaptchaScript(): Promise<GrecaptchaV2> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<GrecaptchaV2>((resolve, reject) => {
    const fail = (message: string) => {
      scriptPromise = null; // allow a retry on the next mount
      reject(new Error(message));
    };
    const script = document.createElement("script");
    script.src = "https://www.google.com/recaptcha/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const api = window.grecaptcha;
      if (!api) return fail("reCAPTCHA failed to initialize.");
      api.ready(() => resolve(api));
    };
    script.onerror = () => fail("reCAPTCHA could not be loaded. Check your connection.");
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export interface RecaptchaCheckboxHandle {
  /** reCAPTCHA tokens are single-use, so clear the tick after every submit. */
  reset(): void;
}

interface RecaptchaCheckboxProps {
  siteKey: string;
  /** Called with the token when the box is ticked, or null when it expires or errors. */
  onChange: (token: string | null) => void;
}

/** Google reCAPTCHA v2 "I'm not a robot" checkbox (with the image challenge when Google asks). */
export const RecaptchaCheckbox = forwardRef<RecaptchaCheckboxHandle, RecaptchaCheckboxProps>(
  function RecaptchaCheckbox({ siteKey, onChange }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const widgetIdRef = useRef<number | null>(null);
    const onChangeRef = useRef(onChange);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);

    useImperativeHandle(ref, () => ({
      reset() {
        if (widgetIdRef.current !== null) window.grecaptcha?.reset(widgetIdRef.current);
        onChangeRef.current(null);
      },
    }));

    useEffect(() => {
      let cancelled = false;
      loadRecaptchaScript()
        .then((api) => {
          const container = containerRef.current;
          if (cancelled || !container || widgetIdRef.current !== null) return;
          widgetIdRef.current = api.render(container, {
            sitekey: siteKey,
            theme: "dark",
            callback: (token) => onChangeRef.current(token),
            "expired-callback": () => onChangeRef.current(null),
            "error-callback": () => onChangeRef.current(null),
          });
        })
        .catch((err: Error) => {
          if (!cancelled) setLoadError(err.message);
        });
      return () => {
        cancelled = true;
        widgetIdRef.current = null;
      };
    }, [siteKey]);

    if (loadError) {
      return <p className="text-xs text-red-300 text-center">{loadError}</p>;
    }
    return <div ref={containerRef} className="flex justify-center min-h-[78px]" />;
  }
);
