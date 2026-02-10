import React, { createContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

// 1. Shape of our user object
export interface globalUser {
  name: string;
  email: string;
}

// 2. Shape of the context value
interface UserContextType {
  globalUser: globalUser | null;
  saveUser: (userData: globalUser) => Promise<void>;
  clearUser: () => Promise<void>;
}

// 3. Create the context with a default (empty) value
export const UserContext = createContext<UserContextType>({
  globalUser: null,
  saveUser: async () => {},
  clearUser: async () => {},
});

// 4. Provider component (wraps the app)
export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [globalUser, setGlobalUser] = useState<globalUser | null>(null);

  // Load user from AsyncStorage on startup
  useEffect(() => {
    const loadUser = async () => {
      try {
        const stored = await AsyncStorage.getItem("user");
        if (stored) setGlobalUser(JSON.parse(stored));
      } catch (err) {
        console.error("Failed to load user", err);
      }
    };
    loadUser();
  }, []);

  // Save user both in memory and AsyncStorage
  const saveUser = async (userData: globalUser) => {
    try {
      await AsyncStorage.setItem("user", JSON.stringify(userData));
      setGlobalUser(userData);
    } catch (err) {
      console.error("Failed to save user", err);
    }
  };

  // Remove user from memory and AsyncStorage
  const clearUser = async () => {
    try {
      await AsyncStorage.removeItem("user");
      setGlobalUser(null);
    } catch (err) {
      console.error("Failed to clear user", err);
    }
  };

  return (
    <UserContext.Provider value={{ globalUser, saveUser, clearUser }}>
      {children}
    </UserContext.Provider>
  );
};
