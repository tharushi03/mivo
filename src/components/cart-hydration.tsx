"use client";

import { useEffect } from "react";
import { useCart } from "@/store/cart";

/** Loads the saved cart after mount, and keeps it in sync across browser tabs. */
export function CartHydration() {
  useEffect(() => {
    useCart.persist.rehydrate();
    const onStorage = (e: StorageEvent) => {
      if (e.key === useCart.persist.getOptions().name) useCart.persist.rehydrate();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return null;
}
