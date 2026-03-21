'use client';

import { useState, useEffect, useCallback } from 'react';

// F4: Module-level singleton — all hook instances share one fetch, no duplicate API calls
let _singletonPromise: Promise<Record<string, string>> | null = null;
let _resolvedMap: Record<string, string> | null = null;
let _fetchError = false;

function getOrFetchMap(): Promise<Record<string, string>> {
  if (_resolvedMap !== null) return Promise.resolve(_resolvedMap);
  if (_singletonPromise) return _singletonPromise;

  _singletonPromise = (async () => {
    try {
      const res = await fetch('/api/team-display-names?modified_only=true');
      if (!res.ok) {
        _fetchError = true;
        _resolvedMap = {};
        return _resolvedMap;
      }

      const json = await res.json();
      if (!json.success || !Array.isArray(json.data)) {
        _fetchError = true;
        _resolvedMap = {};
        return _resolvedMap;
      }

      const newMap: Record<string, string> = {};
      for (const row of json.data) {
        newMap[row.api_name] = row.display_name;
      }
      _resolvedMap = newMap;
      _fetchError = false;
      return _resolvedMap;
    } catch {
      _fetchError = true;
      _resolvedMap = {};
      return _resolvedMap;
    }
  })();

  return _singletonPromise;
}

export function useTeamDisplayNames() {
  const [map, setMap] = useState<Record<string, string>>(_resolvedMap ?? {});
  const [isLoaded, setIsLoaded] = useState(_resolvedMap !== null);
  // F15: hasError distinguishes fetch failure from empty map
  const [hasError, setHasError] = useState(_fetchError);

  useEffect(() => {
    let cancelled = false;

    getOrFetchMap().then((result) => {
      if (!cancelled) {
        setMap(result);
        setIsLoaded(true);
        setHasError(_fetchError);
      }
    });

    return () => { cancelled = true; };
  }, []);

  const resolve = useCallback(
    (apiName: string | null | undefined): string => {
      if (!apiName) return apiName ?? '';
      return map[apiName] ?? apiName;
    },
    [map],
  );

  return { resolve, isLoaded, hasError };
}
