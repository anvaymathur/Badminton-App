// usePlayerProfiles keeps track of which player profiles are visible in match history screens.
// It hydrates cached display names, watches FlatList visibility events to prefetch avatars,
// and surfaces a map of id->profile data so UI components can show names and headshots instantly.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ViewToken, Image } from "react-native";
import { getUserProfilesByIds } from "@/firebase/services_firestore2";

/**
 * Represents the display information for a player profile.
 */
export type PlayerProfileDisplay = {
  /** The player's display name. */
  name: string;
  /** The URL of the player's profile photo, or null if not available. */
  photoUrl?: string | null;
};

// Reusable storage key so we can hydrate name lookups from disk.
const PLAYER_NAMES_CACHE_KEY = "playerNames";

/**
 * Custom hook to manage player profile visibility and data fetching.
 * 
 * This hook is designed to work with a `FlatList` of matches. It:
 * - Tracks which items are currently viewable in the list.
 * - Prefetches profile data (names and avatars) for players in the viewable items.
 * - Caches player names in AsyncStorage for instant display on subsequent loads.
 * - Provides a map of `visiblePlayers` containing rich profile data.
 * 
 * @returns An object containing:
 * - `playerNames`: A map of player IDs to display names (cached).
 * - `visiblePlayers`: A map of player IDs to `PlayerProfileDisplay` objects (fetched on demand).
 * - `onViewableItemsChanged`: A callback to be passed to the `FlatList`'s `onViewableItemsChanged` prop.
 */
export function usePlayerProfiles(eagerIds: string[] = []) {
  // Cached name lookups let us show player labels even before Firestore responds.
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({});
  // Map of user id -> profile data required for avatar rendering.
  const [visiblePlayers, setVisiblePlayers] = useState<
    Record<string, PlayerProfileDisplay>
  >({});
  // Track which ids are currently within the viewport so we prioritise those fetches.
  const visibleIdsRef = useRef<Set<string>>(new Set());
  // Incremented whenever the visible id set changes – used to trigger a refresh.
  const [visibleIdsVersion, setVisibleIdsVersion] = useState(0);
  // Boolean ref ensures we only hydrate the cached names once.
  const loadedNamesFromCacheRef = useRef(false);
  // Eager fetch tracking
  const [profilesLoading, setProfilesLoading] = useState(false);
  const eagerFetchedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (loadedNamesFromCacheRef.current) return;

    let cancelled = false;
    // Attempt to hydrate player names from AsyncStorage so UI has data during first paint.
    const loadNamesCache = async () => {
      try {
        const cached = await AsyncStorage.getItem(PLAYER_NAMES_CACHE_KEY);
        if (cancelled) return;
        if (cached) {
          const parsed = JSON.parse(cached) as {
            ts: number;
            data: Record<string, string>;
          };
          if (parsed?.data) {
            setPlayerNames(parsed.data);
          }
        }
      } catch {
        // We can safely ignore cache errors; lack of cache just means slower initial names.
      } finally {
        loadedNamesFromCacheRef.current = true;
      }
    };

    loadNamesCache();

    return () => {
      cancelled = true;
    };
  }, []);

  // Eager fetch: resolve names for all provided IDs upfront so the UI never shows raw IDs.
  useEffect(() => {
    const newIds = eagerIds.filter(
      (id) => id && id.trim() !== "" && !eagerFetchedIdsRef.current.has(id)
    );
    if (newIds.length === 0) return;

    // Check if all new IDs already have names (from cache or previous fetches)
    const unresolved = newIds.filter((id) => !playerNames[id] && !visiblePlayers[id]);
    if (unresolved.length === 0) {
      newIds.forEach((id) => eagerFetchedIdsRef.current.add(id));
      return;
    }

    let cancelled = false;
    setProfilesLoading(true);

    const fetchEager = async () => {
      try {
        const map = await getUserProfilesByIds(unresolved);
        if (cancelled) return;

        const newProfiles: Record<string, PlayerProfileDisplay> = {};
        const newNameCache: Record<string, string> = {};

        for (const id of unresolved) {
          const profile = map[id];
          if (profile) {
            if (profile.PhotoUrl) {
              Image.prefetch(profile.PhotoUrl).catch(() => {});
            }
            newProfiles[id] = {
              name: profile.Name ?? id,
              photoUrl: profile.PhotoUrl ?? null,
            };
            newNameCache[id] = profile.Name ?? id;
          } else {
            newProfiles[id] = { name: id };
          }
        }

        if (Object.keys(newProfiles).length > 0) {
          setVisiblePlayers((prev) => ({ ...prev, ...newProfiles }));
        }
        if (Object.keys(newNameCache).length > 0) {
          setPlayerNames((prev) => {
            const merged = { ...prev, ...newNameCache };
            AsyncStorage.setItem(
              PLAYER_NAMES_CACHE_KEY,
              JSON.stringify({ ts: Date.now(), data: merged })
            ).catch(() => {});
            return merged;
          });
        }

        // Seed into visibleIdsRef so viewport-based effect doesn't re-fetch
        for (const id of unresolved) {
          visibleIdsRef.current.add(id);
        }
      } catch {
        // Fall back to IDs if fetch fails
      } finally {
        if (!cancelled) {
          newIds.forEach((id) => eagerFetchedIdsRef.current.add(id));
          setProfilesLoading(false);
        }
      }
    };

    fetchEager();
    return () => { cancelled = true; };
  }, [eagerIds, playerNames, visiblePlayers]);

  // Callback plugged into FlatList viewability tracking so we know which player ids to prefetch.
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: Array<ViewToken> }) => {
      const ids = new Set(visibleIdsRef.current);
      let changed = false;

      for (const viewable of viewableItems) {
        const item = viewable.item as any;
        if (!item?.team1 || !item?.team2) continue;

        const nextIds: string[] = [
          item.team1[0],
          item.team1[1],
          item.team2[0],
          item.team2[1],
        ].filter((val): val is string => !!val && val.trim() !== "");

        for (const id of nextIds) {
          if (!ids.has(id)) {
            ids.add(id);
            changed = true;
          }
        }
      }

      if (changed) {
        visibleIdsRef.current = ids;
        setVisibleIdsVersion((prev) => prev + 1);
      }
    },
    []
  );

  useEffect(() => {
    if (visibleIdsVersion === 0 && visiblePlayers && Object.keys(visiblePlayers).length === 0) {
      // Nothing has been viewed yet so there is nothing to fetch.
      return;
    }

    let cancelled = false;

    // Pull profile data for any ids that just scrolled into view.
    const populateVisibleProfiles = async () => {
      const idsToFetch = Array.from(visibleIdsRef.current).filter(
        (id) => !(id in visiblePlayers)
      );

      if (idsToFetch.length === 0) return;

      try {
        const map = await getUserProfilesByIds(idsToFetch);
        if (cancelled) return;

        const newProfiles: Record<string, PlayerProfileDisplay> = {};
        const newNameCache: Record<string, string> = {};

        for (const id of idsToFetch) {
          const profile = map[id];
          if (profile) {
            if (profile.PhotoUrl) {
              Image.prefetch(profile.PhotoUrl).catch(() => {});
            }
            newProfiles[id] = {
              name: profile.Name ?? id,
              photoUrl: profile.PhotoUrl ?? null,
            };
            newNameCache[id] = profile.Name ?? id;
          } else {
            newProfiles[id] = { name: id };
          }
        }

        if (Object.keys(newProfiles).length > 0) {
          setVisiblePlayers((prev) => ({ ...prev, ...newProfiles }));
        }

        if (Object.keys(newNameCache).length > 0) {
          setPlayerNames((prev) => {
            const merged = { ...prev, ...newNameCache };
            AsyncStorage.setItem(
              PLAYER_NAMES_CACHE_KEY,
              JSON.stringify({ ts: Date.now(), data: merged })
            ).catch(() => {});
            return merged;
          });
        }
      } catch {
        // Profiles are primarily used for avatars; if this fails we can fall back to initials.
      }
    };

    populateVisibleProfiles();

    return () => {
      cancelled = true;
    };
  }, [visibleIdsVersion, visiblePlayers]);

  // Force a full re-fetch of all known player profiles by clearing caches.
  const refreshProfiles = useCallback(async () => {
    // Clear AsyncStorage name cache
    await AsyncStorage.removeItem(PLAYER_NAMES_CACHE_KEY).catch(() => {});
    // Reset in-memory state so the eager fetch effect re-runs
    eagerFetchedIdsRef.current = new Set();
    visibleIdsRef.current = new Set();
    loadedNamesFromCacheRef.current = true; // skip re-hydrating stale cache
    setPlayerNames({});
    setVisiblePlayers({});
    setVisibleIdsVersion(0);
  }, []);

  return useMemo(
    () => ({
      // Map of id -> friendly display name used throughout match history UI.
      playerNames,
      // Rich profile map containing both names and photos for visible players.
      visiblePlayers,
      // Hook consumers pass this through to FlatList so we can track which ids need data.
      onViewableItemsChanged,
      // True while the eager fetch for initial IDs is in progress.
      profilesLoading,
      // Clears all cached profile data and triggers a fresh re-fetch.
      refreshProfiles,
    }),
    [playerNames, visiblePlayers, onViewableItemsChanged, profilesLoading, refreshProfiles]
  );
}

