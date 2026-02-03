import { useState, useEffect } from 'react';
import { getUserGroups, getUserProfilesByIds } from '@/firebase/services_firestore2';
import { UserDoc, EventDoc } from '@/firebase/types_index';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/firebase/index';

/**
 * Custom hook to fetch users connected to the current user.
 * 
 * This hook retrieves a list of users who are "connected" to the provided `userId`.
 * A connected user is defined as:
 * - A member of any group the current user belongs to.
 * - A participant in any event the current user is involved in (as a creator, individual participant, or group member).
 * 
 * The hook aggregates unique users from these sources and fetches their profiles.
 * 
 * @param userId - The ID of the current user. If undefined, the hook does nothing.
 * @returns An object containing:
 * - `connectedUsers`: An array of `UserDoc` objects representing the connected users, sorted by name.
 * - `loading`: A boolean indicating whether the data is currently being fetched.
 */
export function useConnectedUsers(userId: string | undefined) {
    const [connectedUsers, setConnectedUsers] = useState<UserDoc[]>([]);
    const [loading, setLoading] = useState(true);

    const [refreshKey, setRefreshKey] = useState(0);

    const refresh = () => {
        setRefreshKey(prev => prev + 1);
    };

    useEffect(() => {
        if (!userId) {
            setLoading(false);
            return;
        }

        const fetchConnectedUsers = async () => {
            setLoading(true);
            try {
                const connectedUserIds = new Set<string>();
                // Add self
                connectedUserIds.add(userId);

                // 1. Get Groups
                const groups = await getUserGroups(userId);
                const userGroupIds = new Set(groups.map(g => g.id));

                groups.forEach(group => {
                    group.MemberIds?.forEach(memberId => connectedUserIds.add(memberId));
                });

                // 2. Get Events
                // We fetch all events and filter because there's no efficient query currently available
                const eventsCol = collection(db, "events");
                const eventsSnapshot = await getDocs(eventsCol);

                eventsSnapshot.forEach(doc => {
                    const evt = doc.data() as EventDoc;

                    // Check if user is involved
                    const isInGroup = evt.GroupIDs && evt.GroupIDs.some((groupId: string) => userGroupIds.has(groupId));
                    const isIndividualParticipant = evt.IndividualParticipantIDs && evt.IndividualParticipantIDs.includes(userId);
                    const isCreator = evt.CreatorID === userId;

                    if (isInGroup || isIndividualParticipant || isCreator) {
                        // Add all individual participants of this event
                        evt.IndividualParticipantIDs?.forEach(pid => connectedUserIds.add(pid));

                        // Note: We are not fetching members of groups that the user is NOT in, 
                        // even if they are in the same event, to avoid excessive reads.
                        // The primary "connected" definition is usually direct group members or direct event participants.
                    }
                });

                const idsToFetch = Array.from(connectedUserIds);
                const profilesMap = await getUserProfilesByIds(idsToFetch);

                const profiles = Object.values(profilesMap).filter((p): p is UserDoc => !!p);

                // Sort by name for better UX
                profiles.sort((a, b) => (a.Name || "").localeCompare(b.Name || ""));

                setConnectedUsers(profiles);

            } catch (e) {
                console.error("Error fetching connected users:", e);
            } finally {
                setLoading(false);
            }
        };

        fetchConnectedUsers();
    }, [userId, refreshKey]);

    return { connectedUsers, loading, refresh };
}
