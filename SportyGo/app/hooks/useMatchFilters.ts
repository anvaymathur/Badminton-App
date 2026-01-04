// useMatchFilters centralizes all filtering state for match history.
// It tracks sort order, result/date/time filters, sheet state, and native picker plumbing,
// letting screens consume a single hook for both UI wiring and filter summaries.
import { useCallback, useMemo, useRef, useState } from "react";

export type FilterPicker = "startDate" | "endDate" | "startTime" | "endTime";

// What the hook hands back to consumers so they can wire up lists, sheets, and pickers with confidence.
/**
 * Return type for the `useMatchFilters` hook.
 * Contains all state and handlers necessary to manage match history filtering.
 */
type UseMatchFiltersReturn = {
  /** The current sort order of the match list ("recent" or "oldest"). */
  sortOrder: "recent" | "oldest";
  /** Function to update the sort order. */
  setSortOrder: (value: "recent" | "oldest") => void;
  /** The active result filter ("all", "win", "lose", "tie"). */
  resultFilter: "all" | "win" | "lose" | "tie";
  /** Function to update the result filter. */
  setResultFilter: (value: "all" | "win" | "lose" | "tie") => void;
  /** The active start date filter. */
  filterStartDate: Date | null;
  /** The active end date filter. */
  filterEndDate: Date | null;
  /** The active start time filter. */
  filterStartTime: Date | null;
  /** The active end time filter. */
  filterEndTime: Date | null;
  /** Whether the filter bottom sheet is currently open. */
  filterSheetOpen: boolean;
  /** Opens the filter bottom sheet. */
  openFilterSheet: () => void;
  /** Closes the filter bottom sheet. */
  closeFilterSheet: () => void;
  /** Boolean indicating if any filter (other than default) is currently active. */
  isFilterActive: boolean;
  /** A human-readable summary string of the active filters. */
  filterSummary: string;
  /** Pending result filter selection (in the sheet, before applying). */
  pendingResultFilter: "all" | "win" | "lose" | "tie";
  /** Pending start date selection. */
  pendingStartDate: Date | null;
  /** Pending end date selection. */
  pendingEndDate: Date | null;
  /** Pending start time selection. */
  pendingStartTime: Date | null;
  /** Pending end time selection. */
  pendingEndTime: Date | null;
  /** Updates the pending result filter. */
  setPendingResultFilter: (value: "all" | "win" | "lose" | "tie") => void;
  /** Updates the pending start date. */
  setPendingStartDate: (value: Date | null) => void;
  /** Updates the pending end date. */
  setPendingEndDate: (value: Date | null) => void;
  /** Updates the pending start time. */
  setPendingStartTime: (value: Date | null) => void;
  /** Updates the pending end time. */
  setPendingEndTime: (value: Date | null) => void;
  /** Clears all pending filter selections in the sheet. */
  clearPendingFilters: () => void;
  /** Applies the pending filters to the active state and closes the sheet. */
  applyFilterChanges: () => void;
  /** Resets all active and pending filters to their default states. */
  resetFilters: () => void;
  /** Helper to format a date object as a string (e.g., "Jan 1, 2023"). */
  formatDateOnly: (value: Date | null) => string;
  /** Helper to format a date object as a time string (e.g., "12:00 PM"). */
  formatTimeOnly: (value: Date | null) => string;
  /** The currently active picker (if any). */
  activePicker: FilterPicker | null;
  /** Opens a specific picker (date or time). */
  openPicker: (picker: FilterPicker) => void;
  /** Handles the closing of the picker dialog. */
  handlePickerDialogClose: (open: boolean) => void;
  /** Confirms the selection in the picker. */
  handlePickerConfirm: () => void;
  /** Cancels the selection in the picker. */
  handlePickerCancel: () => void;
  /** The current value to be displayed in the picker. */
  pickerValue: Date;
  /** The mode of the picker ("date" or "time"). */
  pickerMode: "date" | "time";
  /** The maximum allowed date for the picker. */
  pickerMaximumDate?: Date;
  /** The minimum allowed date for the picker. */
  pickerMinimumDate?: Date;
  /** Updates the pending value for a specific picker. */
  setPendingValue: (picker: FilterPicker, value: Date | null) => void;
};

/**
 * Custom hook to manage match history filtering state.
 * 
 * This hook centralizes all logic for filtering matches by result, date, and time.
 * It handles:
 * - Active filter state (what filters are currently applied to the list).
 * - Pending filter state (what the user is selecting in the filter sheet).
 * - Sort order state.
 * - Logic for opening/closing the filter sheet and date/time pickers.
 * - Formatting helpers for displaying filter summaries.
 * 
 * @returns A `UseMatchFiltersReturn` object containing all state and handlers.
 */
export function useMatchFilters(): UseMatchFiltersReturn {
  // Core filters that drive the list query.
  const [sortOrder, setSortOrder] = useState<"recent" | "oldest">("recent");
  const [resultFilter, setResultFilter] = useState<"all" | "win" | "lose" | "tie">("all");
  const [filterStartDate, setFilterStartDate] = useState<Date | null>(null);
  const [filterEndDate, setFilterEndDate] = useState<Date | null>(null);
  const [filterStartTime, setFilterStartTime] = useState<Date | null>(null);
  const [filterEndTime, setFilterEndTime] = useState<Date | null>(null);

  // Separate "pending" state holds the sheet selections until the user hits Apply.
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [pendingResultFilter, setPendingResultFilter] = useState<
    "all" | "win" | "lose" | "tie"
  >("all");
  const [pendingStartDate, setPendingStartDate] = useState<Date | null>(null);
  const [pendingEndDate, setPendingEndDate] = useState<Date | null>(null);
  const [pendingStartTime, setPendingStartTime] = useState<Date | null>(null);
  const [pendingEndTime, setPendingEndTime] = useState<Date | null>(null);

  // Picker coordination references keep track of which control is open and how to restore state.
  const [activePicker, setActivePicker] = useState<FilterPicker | null>(null);
  const activePickerRef = useRef<FilterPicker | null>(null);
  const pickerPrevValueRef = useRef<Date | null>(null);
  const pickerConfirmedRef = useRef(false);
  const pendingSheetReopenRef = useRef(false);

  // Format helpers used by the UI to render human-friendly summaries.
  const formatDateOnly = useCallback((value: Date | null) => {
    if (!value) return "Any date";
    return value.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }, []);

  const formatTimeOnly = useCallback((value: Date | null) => {
    if (!value) return "Any time";
    return value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }, []);

  // Flag used to toggle filter badges or empty state messaging.
  const isFilterActive = useMemo(
    () =>
      resultFilter !== "all" ||
      filterStartDate !== null ||
      filterEndDate !== null ||
      filterStartTime !== null ||
      filterEndTime !== null,
    [resultFilter, filterStartDate, filterEndDate, filterStartTime, filterEndTime]
  );

  // Utility to produce the readable text found under the filter buttons.
  const appendDateSummary = useCallback(
    (date: Date | null) => (date ? formatDateOnly(date) : "Any"),
    [formatDateOnly]
  );

  const filterSummary = useMemo(() => {
    if (!isFilterActive) return "";
    const parts: string[] = [];
    if (resultFilter !== "all") {
      const labelMap: Record<"win" | "lose" | "tie", string> = {
        win: "Wins",
        lose: "Losses",
        tie: "Ties",
      };
      parts.push(labelMap[resultFilter] ?? resultFilter);
    }
    if (filterStartDate || filterEndDate) {
      parts.push(
        `Dates ${appendDateSummary(filterStartDate)} → ${appendDateSummary(filterEndDate)}`
      );
    }
    if (filterStartTime || filterEndTime) {
      parts.push(
        `Time ${formatTimeOnly(filterStartTime)} → ${formatTimeOnly(filterEndTime)}`
      );
    }
    return parts.join(" · ");
  }, [
    isFilterActive,
    resultFilter,
    filterStartDate,
    filterEndDate,
    filterStartTime,
    filterEndTime,
    appendDateSummary,
    formatTimeOnly,
  ]);

  // Open the sheet and seed the pending values with whatever filters are currently active.
  const openFilterSheet = useCallback(() => {
    pendingSheetReopenRef.current = false;
    setPendingResultFilter(resultFilter);
    setPendingStartDate(filterStartDate);
    setPendingEndDate(filterEndDate);
    setPendingStartTime(filterStartTime);
    setPendingEndTime(filterEndTime);
    setFilterSheetOpen(true);
  }, [resultFilter, filterStartDate, filterEndDate, filterStartTime, filterEndTime]);

  const closeFilterSheet = useCallback(() => setFilterSheetOpen(false), []);

  // Quickly clear the draft state while leaving the applied filters untouched.
  const clearPendingFilters = useCallback(() => {
    setPendingResultFilter("all");
    setPendingStartDate(null);
    setPendingEndDate(null);
    setPendingStartTime(null);
    setPendingEndTime(null);
  }, []);

  // Commit the choices the user made in the sheet to the live filters.
  const applyFilterChanges = useCallback(() => {
    setResultFilter(pendingResultFilter);
    setFilterStartDate(pendingStartDate);
    setFilterEndDate(pendingEndDate);
    setFilterStartTime(pendingStartTime);
    setFilterEndTime(pendingEndTime);
    setFilterSheetOpen(false);
  }, [
    pendingResultFilter,
    pendingStartDate,
    pendingEndDate,
    pendingStartTime,
    pendingEndTime,
  ]);

  // Reset everything back to defaults and mirror that change to the pending state.
  const resetFilters = useCallback(() => {
    setResultFilter("all");
    setFilterStartDate(null);
    setFilterEndDate(null);
    setFilterStartTime(null);
    setFilterEndTime(null);
    setPendingResultFilter("all");
    setPendingStartDate(null);
    setPendingEndDate(null);
    setPendingStartTime(null);
    setPendingEndTime(null);
  }, []);

  // Small helpers for the picker workflow – they centralise access to whichever field is active.
  const getPendingValue = useCallback(
    (picker: FilterPicker): Date | null => {
      switch (picker) {
        case "startDate":
          return pendingStartDate;
        case "endDate":
          return pendingEndDate;
        case "startTime":
          return pendingStartTime;
        case "endTime":
          return pendingEndTime;
        default:
          return null;
      }
    },
    [pendingStartDate, pendingEndDate, pendingStartTime, pendingEndTime]
  );

  const setPendingValue = useCallback(
    (picker: FilterPicker, value: Date | null) => {
      switch (picker) {
        case "startDate":
          setPendingStartDate(value);
          break;
        case "endDate":
          setPendingEndDate(value);
          break;
        case "startTime":
          setPendingStartTime(value);
          break;
        case "endTime":
          setPendingEndTime(value);
          break;
        default:
          break;
      }
    },
    []
  );

  // Triggered when a particular date/time selector is launched from the sheet.
  const openPicker = useCallback(
    (picker: FilterPicker) => {
      if (filterSheetOpen) {
        pendingSheetReopenRef.current = true;
        setFilterSheetOpen(false);
      } else {
        pendingSheetReopenRef.current = false;
      }
      activePickerRef.current = picker;
      pickerPrevValueRef.current = getPendingValue(picker);
      pickerConfirmedRef.current = false;
      setActivePicker(picker);
    },
    [filterSheetOpen, getPendingValue]
  );

  const handlePickerDialogClose = useCallback(
    (open: boolean) => {
      if (open) return;
      const picker = activePickerRef.current;
      if (!picker) return;

      if (!pickerConfirmedRef.current) {
        setPendingValue(picker, pickerPrevValueRef.current ?? null);
      }

      activePickerRef.current = null;
      pickerPrevValueRef.current = null;
      pickerConfirmedRef.current = false;
      setActivePicker(null);

      if (pendingSheetReopenRef.current) {
        pendingSheetReopenRef.current = false;
        setTimeout(() => setFilterSheetOpen(true), 0);
      }
    },
    [setPendingValue]
  );

  // Guarantees that dismissing the picker with "Done" still applies a sensible default (today / now).
  const ensureDefaultValue = useCallback(
    (picker: FilterPicker) => {
      if (getPendingValue(picker)) return;
      const now = new Date();
      if (picker === "startDate" || picker === "endDate") {
        setPendingValue(
          picker,
          new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
        );
      } else {
        setPendingValue(
          picker,
          new Date(1970, 0, 1, now.getHours(), now.getMinutes(), 0, 0)
        );
      }
    },
    [getPendingValue, setPendingValue]
  );

  const handlePickerConfirm = useCallback(() => {
    const picker = activePickerRef.current;
    if (picker) {
      ensureDefaultValue(picker);
    }
    pickerConfirmedRef.current = true;
  }, [ensureDefaultValue]);

  const handlePickerCancel = useCallback(() => {
    pickerConfirmedRef.current = false;
  }, []);

  // Feed the picker the currently pending value (or an appropriate default) so UI stays in sync.
  const pickerValue = useMemo(() => {
    if (!activePickerRef.current) {
      return new Date();
    }
    const picker = activePickerRef.current;
    const pending = getPendingValue(picker);
    if (pending) return pending;
    if (picker === "startDate" || picker === "endDate") {
      return new Date();
    }
    const now = new Date();
    return new Date(1970, 0, 1, now.getHours(), now.getMinutes(), 0, 0);
  }, [activePicker, getPendingValue]);

  // The UI expects explicit metadata about how to render the native picker component.
  const pickerMode: "date" | "time" =
    activePicker && (activePicker === "startDate" || activePicker === "endDate")
      ? "date"
      : "time";

  const pickerMaximumDate =
    activePicker && (activePicker === "startDate" || activePicker === "endDate")
      ? new Date()
      : undefined;

  const pickerMinimumDate =
    activePicker && (activePicker === "startDate" || activePicker === "endDate")
      ? new Date(2000, 0, 1)
      : undefined;

  return {
    sortOrder,
    setSortOrder,
    resultFilter,
    filterStartDate,
    filterEndDate,
    filterStartTime,
    filterEndTime,
    filterSheetOpen,
    openFilterSheet,
    closeFilterSheet,
    isFilterActive,
    filterSummary,
    pendingResultFilter,
    pendingStartDate,
    pendingEndDate,
    pendingStartTime,
    pendingEndTime,
    setPendingResultFilter,
    setPendingStartDate,
    setPendingEndDate,
    setPendingStartTime,
    setPendingEndTime,
    clearPendingFilters,
    applyFilterChanges,
    resetFilters,
    formatDateOnly,
    formatTimeOnly,
    activePicker,
    openPicker,
    handlePickerDialogClose,
    handlePickerConfirm,
    handlePickerCancel,
    pickerValue,
    pickerMode,
    pickerMaximumDate,
    pickerMinimumDate,
    setPendingValue,
    setResultFilter: (value: "all" | "win" | "lose" | "tie") => {
      setResultFilter(value);
      setPendingResultFilter(value);
    },
  };
}

