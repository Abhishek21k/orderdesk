"use client";

import { useShape } from "@electric-sql/react";
import { useEffect, useState } from "react";

const ELECTRIC_URL =
  process.env.NEXT_PUBLIC_ELECTRIC_URL ?? "http://localhost:30001";

/**
 * Subscribes to the change_log table via Electric's HTTP shape API.
 * Returns a version number that increments whenever any order changes.
 *
 * Consumers put `version` in a useEffect dependency list to re-fetch their
 * server-side page / dashboard aggregates. Electric is used purely as a
 * change-notification channel here — the actual order data still comes from
 * the paginated/aggregated API, never streamed wholesale to the client.
 */
export function useLiveSync(): number {
  const { data } = useShape<{ id: number }>({
    url: `${ELECTRIC_URL}/v1/shape`,
    params: { table: "change_log" },
  });

  const [version, setVersion] = useState(0);
  const marker = data ? data.length : 0;

  useEffect(() => {
    setVersion((v) => v + 1);
  }, [marker]);

  return version;
}
