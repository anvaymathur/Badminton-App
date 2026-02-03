import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  createTempUser,
  findUnclaimedTempByEmail,
  findUnclaimedTempByPhone,
  findUnclaimedTempsByOwner,
  addTempOwner,
  mergeTempUsers,
} from '@/firebase/services_firestore2';
import { UserDoc } from '@/firebase/types_index';

interface TempUserSummary {
  id: string;
  Name: string;
}

/**
 * Hook that manages temporary user creation, deduplication, and player-picker integration.
 *
 * Responsibilities:
 *   A. Fetches all unclaimed temp users owned by the current user (for the player picker).
 *   B. Exposes createOrReuseTempUser which implements the full deduplication decision tree:
 *        - No existing match   → create a new temp user
 *        - One match (email or phone) → reuse it, add current user as owner
 *        - Two different matches (email→A, phone→B) → merge B into A, reuse A
 *
 * @param ownerSub - The Auth0 sub of the currently logged-in user. Pass undefined if not yet available.
 */
export function useTempUsers(ownerSub: string | undefined) {
  const [ownedTemps, setOwnedTemps] = useState<TempUserSummary[]>([]);
  const [isLoadingTemps, setIsLoadingTemps] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const refreshTemps = useCallback(() => setRefreshKey(k => k + 1), []);

  useEffect(() => {
    if (!ownerSub) return;
    let cancelled = false;

    const fetch = async () => {
      setIsLoadingTemps(true);
      try {
        const temps = await findUnclaimedTempsByOwner(ownerSub);
        if (!cancelled) {
          setOwnedTemps(temps.map(t => ({ id: t.id, Name: t.Name })));
        }
      } catch (e) {
        console.error('useTempUsers: failed to fetch owned temps', e);
      } finally {
        if (!cancelled) setIsLoadingTemps(false);
      }
    };

    fetch();
    return () => { cancelled = true; };
  }, [ownerSub, refreshKey]);

  /**
   * Deduplication decision tree.
   * Returns the resolved temp user (id + Name) after create / reuse / merge.
   */
  const createOrReuseTempUser = useCallback(async (
    name: string,
    email: string,
    phone: string
  ): Promise<TempUserSummary> => {
    if (!ownerSub) throw new Error('Not authenticated');

    const normalizedEmail = email ? email.toLowerCase().trim() : '';
    const normalizedPhone = phone ? phone.replace(/\D/g, '') : '';

    // Run both lookups in parallel
    const [emailMatch, phoneMatch] = await Promise.all([
      normalizedEmail ? findUnclaimedTempByEmail(normalizedEmail) : undefined,
      normalizedPhone ? findUnclaimedTempByPhone(normalizedPhone) : undefined,
    ]);

    // Case A: no existing match → create
    if (!emailMatch && !phoneMatch) {
      const id = uuidv4();
      const newDoc: UserDoc = {
        id,
        Name: name,
        Email: normalizedEmail,
        Phone: normalizedPhone,
        Groups: [],
        Address: '',
        isTemp: true,
        owners: [ownerSub],
        claimedBy: null,
        createdAt: new Date(),
      };
      await createTempUser(id, newDoc);
      refreshTemps();
      return { id, Name: name };
    }

    // Case B: email match only
    if (emailMatch && !phoneMatch) {
      await addTempOwner(emailMatch.id, ownerSub);
      refreshTemps();
      return { id: emailMatch.id, Name: emailMatch.Name };
    }

    // Case C: phone match only
    if (!emailMatch && phoneMatch) {
      await addTempOwner(phoneMatch.id, ownerSub);
      refreshTemps();
      return { id: phoneMatch.id, Name: phoneMatch.Name };
    }

    // Case D: both matched
    // D1: same document
    if (emailMatch!.id === phoneMatch!.id) {
      await addTempOwner(emailMatch!.id, ownerSub);
      refreshTemps();
      return { id: emailMatch!.id, Name: emailMatch!.Name };
    }

    // D2: two different documents → merge phoneMatch into emailMatch
    await mergeTempUsers(emailMatch!.id, phoneMatch!.id);
    await addTempOwner(emailMatch!.id, ownerSub);
    refreshTemps();
    return { id: emailMatch!.id, Name: emailMatch!.Name };
  }, [ownerSub, refreshTemps]);

  return { ownedTemps, isLoadingTemps, refreshTemps, createOrReuseTempUser };
}
