// useMatchHistory manages retrieval of a user's match history records.
// It hydrates from AsyncStorage for fast first paint, gracefully refreshes stale data,
// and exposes helpers for pull-to-refresh and retry flows so screens can stay lightweight.
import { useCallback, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getUserMatchHistory } from "@/firebase/services_firestore2";
import { newMatchHistory } from "@/firebase/types_index";

// Shape returned by the useMatchHistory hook to keep consuming components type-safe.
/**
 * Return type for the `useMatchHistory` hook.
 */
type UseMatchHistoryResult = {
  /** The list of match history records for the user. */
  matchHistory: newMatchHistory[];
  /** Whether the data is currently being fetched (initial load). */
  loading: boolean;
  /** Whether the data is currently being refreshed (pull-to-refresh). */
  refreshing: boolean;
  /** Error message if the fetch failed, or null if successful. */
  errorMessage: string | null;
  /** Function to retry the fetch operation (sets loading state). */
  retry: () => Promise<void>;
  /** Function to handle pull-to-refresh (sets refreshing state). */
  handleRefresh: () => Promise<void>;
};

// Prefix used when caching per-user match history in AsyncStorage.
const CACHE_PREFIX = "mh:";
// Cache entries expire after ten minutes to balance freshness and network usage.
const CACHE_TTL_MS = 10 * 60 * 1000;

// Utility helper that tells us whether a cache timestamp is still considered current.
const isFresh = (timestamp?: number) =>
  typeof timestamp === "number" && Date.now() - timestamp < CACHE_TTL_MS;

/**
 * Custom hook to manage retrieval of a user's match history records.
 * 
 * This hook handles:
 * - Fetching match history from Firestore.
 * - Caching results in AsyncStorage for fast initial load.
 * - Managing loading, refreshing, and error states.
 * - Providing retry and refresh mechanisms.
 * 
 * @param userID - The ID of the user to fetch history for. If null, returns empty state.
 * @returns A `UseMatchHistoryResult` object containing data and control functions.
 */
export function useMatchHistory(userID: string | null): UseMatchHistoryResult {
  // Local state mirrors the remote match history collection for the active user.
  const [matchHistory, setMatchHistory] = useState<newMatchHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Derive a cache key for lookups so each user gets their own persisted entry.
  const cacheKey = useMemo(
    () => (userID ? `${CACHE_PREFIX}${userID}` : null),
    [userID]
  );

  // Fetch match history from Firestore and optionally show the spinner while we wait.
  const refreshFromNetwork = useCallback(
    async (showSpinner: boolean) => {
      if (!userID) {
        // Without a signed-in user there is nothing to fetch, so reset to empty state.
        setMatchHistory([]);
        setLoading(false);
        setRefreshing(false);
        setErrorMessage(null);
        return;
      }

      if (showSpinner) {
        setLoading(true);
      }
      setErrorMessage(null);

      try {
        // Pull the latest match documents and fall back to an empty list if none exist.
        const userMatchHistory = await getUserMatchHistory(userID);
        setMatchHistory(userMatchHistory ?? []);

        if (cacheKey) {
          // Persist the fresh response so subsequent loads can hydrate instantly.
          await AsyncStorage.setItem(
            cacheKey,
            JSON.stringify({
              ts: Date.now(),
              data: userMatchHistory ?? [],
            })
          );
        }
      } catch (err) {
        // Communicate that something went wrong without exposing implementation details.
        setErrorMessage("Couldn't load match history. Tap to retry.");
      } finally {
        if (showSpinner) {
          setLoading(false);
        }
      }
    },
    [userID, cacheKey]
  );

  // Pull-to-refresh handler for list views – keeps the spinner separate from initial load.
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setErrorMessage(null);
    try {
      await refreshFromNetwork(false);
    } finally {
      setRefreshing(false);
    }
  }, [refreshFromNetwork]);

  // Expose an explicit retry helper so error states can trigger a refetch with UI feedback.
  const retry = useCallback(async () => {
    await refreshFromNetwork(true);
  }, [refreshFromNetwork]);

  useEffect(() => {
    let cancelled = false;

    // Initial load routine: hydrate from cache, refresh if stale, and guard against race conditions.
    const loadAndRefresh = async () => {
      if (!userID || !cacheKey) {
        // No user means no history, so clear everything and exit early.
        setMatchHistory([]);
        setLoading(false);
        return;
      }

      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cancelled) return;

        if (cached) {
          const parsed = JSON.parse(cached) as {
            ts: number;
            data: newMatchHistory[];
          };
          if (parsed?.data) {
            // Serve cached results immediately for snappy UI.
            setMatchHistory(parsed.data);
            setLoading(false);
          }

          if (isFresh(parsed?.ts)) {
            // Cache is recent enough – trigger a silent background refresh and exit.
            refreshFromNetwork(false);
            return;
          }
        }
      } catch {
        if (!cancelled) {
          setErrorMessage("Couldn't load match history. Tap to retry.");
        }
      }

      // Either no cache or it was stale, so perform a full fetch with loading feedback.
      await refreshFromNetwork(true);
    };

    loadAndRefresh();

    return () => {
      // Protect against state updates if the component unmounts mid-request.
      cancelled = true;
    };
  }, [userID, cacheKey, refreshFromNetwork]);

  return {
    matchHistory,
    loading,
    refreshing,
    errorMessage,
    retry,
    handleRefresh,
  };
}

